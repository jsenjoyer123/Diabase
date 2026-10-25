// Drives one real bridge from a hand-written peer to pin the wire-level rules.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bridge, Context, PROTOCOL_VERSION } from '@diabase/kernel'
import type { BridgeConfig, BridgeStatus } from '@diabase/kernel'
import { RawPeer, captureLogs, createPair, flush, until } from './helpers/bridge.ts'
import type { Pair } from './helpers/bridge.ts'
import { Vault, deferred } from './helpers/services.ts'

let pair: Pair
let peer: RawPeer

const config = (extra: Partial<BridgeConfig> = {}): BridgeConfig => ({
  transport: pair.mainTransport,
  name: 'main',
  expose: ['vault'],
  ...extra,
})

beforeEach(() => {
  pair = createPair()
  peer = new RawPeer(pair.rendererPort)
})
afterEach(() => {
  vi.useRealTimers()
  pair.close()
})

/** Plugs the bridge under test next to a vault and completes the handshake with `peer`. */
async function setup(extra: Partial<BridgeConfig> = {}) {
  const provider = pair.main.plugin(Vault)
  await provider
  const vault = pair.main.get('vault') as unknown as Vault
  const bridge = pair.main.plugin(Bridge, config(extra))
  await bridge
  await peer.connect()
  await until(() => peer.of('up').length, 'up announcement')
  return { provider, vault, bridge }
}

async function request(message: Record<string, unknown>) {
  const id = (message.id as number) ?? 1
  peer.send({ t: 'call', id, ...message })
  await until(() => peer.of('result').some((m) => m.id === id), `result ${id}`)
  return peer.of('result').find((m) => m.id === id)!
}

describe('handshake', () => {
  it('sends one hello at start, acks a fresh hello exactly once, and never answers an ack', async () => {
    await pair.main.plugin(Bridge, config())
    await until(() => peer.of('hello').length, 'hello')
    expect(peer.of('hello')).toEqual([expect.objectContaining({ t: 'hello', v: PROTOCOL_VERSION, ack: false, name: 'main' })])

    peer.hello()
    await until(() => peer.of('hello').length === 2, 'ack')
    expect(peer.of('hello')[1]).toMatchObject({ ack: true, s: peer.of('hello')[0]!.s })

    peer.hello({ ack: true })
    peer.hello({ ack: true })
    await flush()
    expect(peer.of('hello').length).toBe(2)
  })

  it('answers a duplicated fresh hello without resetting the connection', async () => {
    const { vault } = await setup()
    peer.hello()
    await until(() => peer.of('hello').length === 3, 'second ack')
    expect(peer.of('hello')[2]).toMatchObject({ ack: true })
    expect((await request({ name: 'vault', method: 'add', args: [1, 2] })).value).toBe(3)
    expect(vault).toBeDefined()
  })

  it('stays disconnected on a protocol version mismatch and logs an error', async () => {
    const logs = captureLogs(pair.main)
    const statuses: BridgeStatus[] = []
    pair.main.on('bridge/status', (status) => void statuses.push(status))
    await pair.main.plugin(Vault)
    await pair.main.plugin(Bridge, config())
    await until(() => peer.of('hello').length, 'hello')
    peer.hello({ v: PROTOCOL_VERSION + 1 })
    await until(() => logs.some((m) => m.type === 'error'), 'version error')
    await flush()
    expect(String(logs.find((m) => m.type === 'error')!.args[0])).toMatch(/protocol version mismatch/)
    expect(peer.of('hello').length).toBe(1) // no ack
    expect(peer.of('up')).toEqual([])
    expect(statuses).toEqual([])
  })

  it('treats a hello with a new session id as the end of the old session', async () => {
    const { vault } = await setup()
    // A second, independent peer-side bridge impersonation: new session id, no bye in between.
    const statuses: boolean[] = []
    pair.main.on('bridge/status', (status) => void statuses.push(status.connected))
    peer.hello({ s: 'raw-peer-restarted' })
    await until(() => peer.of('hello').filter((m) => m.ack).length === 2, 'second ack')
    // It re-announces to the new session (addressed to it), and old-session traffic is stale.
    await until(() => peer.of('up').length === 2, 'up for the new session')
    expect(peer.of('up')[1]).toMatchObject({ r: 'raw-peer-restarted', name: 'vault' })
    expect(statuses).toEqual([false, true])

    peer.send({ t: 'call', id: 9, name: 'vault', method: 'add', args: [1, 1] })
    await flush()
    expect(peer.of('result')).toEqual([]) // sent as 'raw-peer', which is no longer the peer
    expect(vault.calls).toEqual([])
  })

  it('says bye when disposed', async () => {
    const { bridge } = await setup()
    await bridge.dispose()
    await until(() => peer.of('bye').length, 'bye')
    expect(peer.of('bye')[0]).toMatchObject({ s: peer.bridgeSession })
  })
})

describe('untrusted input', () => {
  it('ignores malformed messages with a debug log and keeps working', async () => {
    const logs = captureLogs(pair.main)
    await setup()
    const junk: unknown[] = [
      'junk',
      42,
      null,
      undefined,
      [],
      {},
      { t: 'hello' },
      { t: 'hello', s: 'x', v: 'one', ack: false, name: 'x' },
      { s: peer.session, t: 'nope' },
      { s: peer.session, r: peer.bridgeSession, t: 'call' },
      { s: peer.session, r: peer.bridgeSession, t: 'call', id: -1, name: 'vault', method: 'add', args: [] },
      { s: peer.session, r: peer.bridgeSession, t: 'call', id: 1, name: 'vault', method: 'add', args: 'nope' },
      { s: peer.session, r: peer.bridgeSession, t: 'up', name: 'vault', gen: 1, methods: [1] },
      { s: peer.session, r: peer.bridgeSession, t: 'event', name: 5, args: [] },
      { s: peer.session, r: peer.bridgeSession, t: 'event', name: 'x', args: 'no' },
      { s: peer.session, r: peer.bridgeSession, t: 'result' },
      { s: '', t: 'bye' },
    ]
    for (const message of junk) peer.port.postMessage(message)
    await flush()
    expect(peer.of('result')).toEqual([])
    expect(logs.filter((m) => m.type === 'debug' && String(m.args[0]).includes('EPROTOCOL')).length).toBeGreaterThanOrEqual(junk.length - 3)
    expect(logs.filter((m) => m.type === 'error')).toEqual([])
    expect((await request({ id: 100, name: 'vault', method: 'add', args: [20, 22] })).value).toBe(42)
  })

  it.each(['__proto__', 'toString', 'constructor', 'hasOwnProperty', 'valueOf', '_private', 'accessor', 'ctx', 'name', 'then', 'nope', 'ctx.fiber', ''])(
    'refuses to invoke %j',
    async (method) => {
      const { vault } = await setup()
      const spies = [vi.spyOn(vault, '_private'), vi.spyOn(vault, 'add')]
      const result = await request({ name: 'vault', method, args: [] })
      expect(result).toMatchObject({ ok: false, error: { name: 'BridgeError', code: 'ENOMETHOD' } })
      for (const spy of spies) expect(spy).not.toHaveBeenCalled()
    },
  )

  it.each(['__proto__', 'constructor', 'toString', 'slots', ''])('answers ENOSERVICE for service %j', async (name) => {
    await setup()
    expect(await request({ name, method: 'add', args: [] })).toMatchObject({ ok: false, error: { code: 'ENOSERVICE' } })
  })

  it('announces only real methods: never accessors, private names, or Object.prototype members', async () => {
    await setup()
    const methods = peer.of('up')[0]!.methods as string[]
    expect(methods).toContain('info')
    expect(methods).toContain('stat')
    expect(methods).toContain('inherited')
    for (const forbidden of ['_private', 'accessor', 'ctx', 'name', 'constructor', 'toString', 'hasOwnProperty', '__proto__', 'then']) {
      expect(methods).not.toContain(forbidden)
    }
  })

  it('strips forbidden names even from an explicit method list', async () => {
    await pair.main.plugin(Vault)
    await pair.main.plugin(Bridge, config({ expose: [{ name: 'vault', methods: ['add', '__proto__', 'then', 'constructor', 'prototype'] }] }))
    await peer.connect()
    await until(() => peer.of('up').length, 'up')
    expect(peer.of('up')[0]!.methods).toEqual(['add'])
  })

  it('ignores traffic from a stale session or addressed to another session', async () => {
    const { vault } = await setup()
    const add = vi.spyOn(vault, 'add')
    peer.send({ t: 'call', id: 1, name: 'vault', method: 'add', args: [1, 1], r: 'someone-else' })
    peer.send({ t: 'call', id: 2, name: 'vault', method: 'add', args: [1, 1], s: 'impostor' })
    await flush()
    expect(peer.of('result')).toEqual([])
    expect(add).not.toHaveBeenCalled()
    expect((await request({ id: 3, name: 'vault', method: 'add', args: [1, 1] })).value).toBe(2)
  })

  it('ignores results for unknown calls and releases for unknown services', async () => {
    const logs = captureLogs(pair.main)
    await setup()
    peer.send({ t: 'result', id: 12345, ok: true, value: 1 })
    peer.send({ t: 'released', name: 'vault', gen: 999 })
    peer.send({ t: 'released', name: 'nope', gen: 1 })
    await flush()
    expect(logs.filter((m) => m.type === 'error')).toEqual([])
    expect((await request({ id: 4, name: 'vault', method: 'add', args: [1, 1] })).value).toBe(2)
  })

  it('does not release a draining service for a stale generation', async () => {
    const { provider } = await setup({ releaseTimeout: 60_000 })
    const up = peer.of('up')[0]!
    let done = false
    const disposal = provider.dispose().then(() => (done = true))
    await until(() => peer.of('down').length, 'down')
    expect(peer.of('down')[0]).toMatchObject({ name: 'vault', gen: up.gen })

    peer.send({ t: 'released', name: 'vault', gen: up.gen + 1 })
    peer.send({ t: 'released', name: 'other', gen: up.gen })
    await flush()
    expect(done).toBe(false)

    peer.send({ t: 'released', name: 'vault', gen: up.gen })
    await disposal
    expect(done).toBe(true)
  })

  it('keeps serving calls while a service drains, then answers ENOSERVICE', async () => {
    const { provider } = await setup({ releaseTimeout: 60_000 })
    const disposal = provider.dispose()
    await until(() => peer.of('down').length, 'down')
    expect((await request({ id: 7, name: 'vault', method: 'add', args: [3, 4] })).value).toBe(7)
    peer.send({ t: 'released', name: 'vault', gen: peer.of('down')[0]!.gen })
    await disposal
    expect(await request({ id: 8, name: 'vault', method: 'add', args: [3, 4] })).toMatchObject({ ok: false, error: { code: 'ENOSERVICE' } })
  })
})

describe('importing from a hand-driven peer', () => {
  async function importing(extra: Partial<BridgeConfig> = {}) {
    const log: string[] = []
    pair.main.plugin({
      name: 'consumer',
      inject: ['slots'],
      apply(ctx: Context) {
        log.push('apply')
        ctx.effect(() => async () => {
          log.push('dispose:start')
          await (extra.name === 'slow' ? deferred().promise : Promise.resolve())
          log.push('dispose:end')
        })
      },
    })
    await pair.main.plugin(Bridge, { transport: pair.mainTransport, name: 'main', import: ['slots'], ...extra })
    await peer.connect()
    return log
  }
  const up = (gen: number, methods = ['getCatalog']) =>
    peer.send({ t: 'up', name: 'slots', gen, methods })

  it('provides the proxy on up, ignores unknown announcements, and sends released after the drain', async () => {
    const log = await importing()
    peer.send({ t: 'up', name: 'unknown', gen: 1, methods: ['x'] })
    await flush()
    expect(pair.main.get('unknown')).toBeUndefined()
    expect(log).toEqual([])

    up(1)
    await until(() => log.length, 'apply')
    const call = (pair.main.get('slots') as any).getCatalog()
    await until(() => peer.of('call').length, 'call on the wire')
    const wire = peer.of('call')[0]!
    expect(wire).toMatchObject({ name: 'slots', method: 'getCatalog', args: [], r: 'raw-peer', s: peer.bridgeSession })
    peer.send({ t: 'result', id: wire.id, ok: true, value: ['a'] })
    expect(await call).toEqual(['a'])

    peer.send({ t: 'down', name: 'slots', gen: 1 })
    await until(() => peer.of('released').length, 'released')
    expect(log).toEqual(['apply', 'dispose:start', 'dispose:end'])
    expect(peer.of('released')[0]).toMatchObject({ name: 'slots', gen: 1 })
    expect(pair.main.get('slots')).toBeUndefined()
  })

  it('replies released immediately for services it does not import or never provided', async () => {
    await importing()
    peer.send({ t: 'down', name: 'secret', gen: 3 })
    peer.send({ t: 'down', name: 'slots', gen: 3 })
    await until(() => peer.of('released').length === 2, 'both released')
  })

  it('serializes a fast down -> up without double registration', async () => {
    const log = await importing()
    const logs = captureLogs(pair.main)
    up(1)
    await until(() => log.length, 'apply')
    peer.send({ t: 'down', name: 'slots', gen: 1 })
    up(2, ['getCatalog', 'other'])
    peer.send({ t: 'down', name: 'slots', gen: 2 })
    up(3)
    await until(() => pair.main.get('slots') && log.at(-1) === 'apply', 'settled')
    await flush()
    expect(logs.filter((m) => m.type === 'error')).toEqual([])
    expect(peer.of('released').map((m) => m.gen)).toEqual([1, 2])
    const count = (entry: string) => log.filter((e) => e === entry).length
    expect(count('apply')).toBe(count('dispose:end') + 1)
  })

  it('does not resurrect a proxy from a stale or already withdrawn generation', async () => {
    const log = await importing()
    up(3)
    await until(() => log.length, 'first apply')
    peer.send({ t: 'down', name: 'slots', gen: 3 })
    await until(() => peer.of('released').length, 'release of generation 3')
    expect(pair.main.get('slots')).toBeUndefined()

    up(2)
    up(3) // A duplicate announcement after down is stale too.
    await flush()
    expect(pair.main.get('slots')).toBeUndefined()
    expect(log).toEqual(['apply', 'dispose:start', 'dispose:end'])
  })

  it('rejects in-flight calls with ESERVICEDOWN after the drain, and keeps them callable during it', async () => {
    const log = await importing({ name: 'slow' })
    up(1)
    await until(() => log.length, 'apply')
    const proxy = pair.main.get('slots') as any
    const pending = proxy.getCatalog().catch((e: any) => e.code)

    peer.send({ t: 'down', name: 'slots', gen: 1 })
    await until(() => log.includes('dispose:start'), 'drain started')
    // Still callable while dependents drain.
    const during = proxy.getCatalog()
    await until(() => peer.of('call').length === 2, 'second call sent')
    peer.send({ t: 'result', id: peer.of('call')[1]!.id, ok: true, value: 'during-drain' })
    expect(await during).toBe('during-drain')
    expect(peer.of('released')).toEqual([])
    expect(pair.main.get('slots')).toBeUndefined()

    // The drain never finishes here, so disconnecting must still clean up.
    pair.rendererPort.close()
    expect(await pending).toBe('EDISCONNECTED')
  })

  it('drops in-flight calls of the old session on a restarted peer and accepts the new one', async () => {
    const log = await importing()
    up(1)
    await until(() => log.length, 'apply')
    const proxy = pair.main.get('slots') as any
    const pending = proxy.getCatalog().catch((e: any) => e.code)
    await until(() => peer.of('call').length, 'call')
    const stale = peer.of('call')[0]!

    peer.hello({ s: 'restarted' })
    expect(await pending).toBe('EDISCONNECTED')
    await until(() => log.at(-1) === 'dispose:end', 'dependent disposed')
    expect(pair.main.get('slots')).toBeUndefined()

    // The old session's late answer is ignored; the new session works.
    peer.send({ t: 'result', id: stale.id, ok: true, value: 'late' })
    peer.port.postMessage({ t: 'up', s: 'restarted', r: peer.bridgeSession, name: 'slots', gen: 1, methods: ['getCatalog'] })
    await until(() => pair.main.get('slots'), 'proxy for the new session')
    expect(log.filter((entry) => entry === 'apply').length).toBe(2)
  })
})

describe('events from the peer', () => {
  it('emits accepted events and drops everything else', async () => {
    const logs = captureLogs(pair.main)
    const seen: unknown[][] = []
    pair.main.on('vault/changed', (...args) => void seen.push(args))
    pair.main.on('index/ready', () => void seen.push(['index/ready']))
    await pair.main.plugin(Bridge, config({ expose: [], accept: ['vault/changed'] }))
    await peer.connect()
    peer.send({ t: 'event', name: 'index/ready', args: [] })
    peer.send({ t: 'event', name: 'internal/plugin', args: [] })
    peer.send({ t: 'event', name: '__proto__', args: [] })
    peer.send({ t: 'event', name: 'vault/changed', args: [[{ type: 'add' }]] })
    await until(() => seen.length, 'accepted event')
    await flush()
    expect(seen).toEqual([[[{ type: 'add' }]]])
    expect(logs.filter((m) => m.type === 'debug' && String(m.args[0]).includes('not accepted')).length).toBe(3)
  })

  it('refuses to accept or forward internal/* events', async () => {
    const logs = captureLogs(pair.main)
    const seen: string[] = []
    pair.main.on('internal/custom' as never, (() => void seen.push('internal')) as never)
    await pair.main.plugin(Bridge, config({ expose: [], accept: ['internal/custom'], forward: ['internal/custom'] }))
    await peer.connect()
    peer.send({ t: 'event', name: 'internal/custom', args: [] })
    await flush()
    expect(seen).toEqual([])
    expect(logs.filter((m) => m.type === 'warn').length).toBe(2)
  })
})

describe('configuration', () => {
  const reject = async (bad: unknown) => {
    const logs = captureLogs(pair.main)
    await expect(pair.main.plugin(Bridge, bad as BridgeConfig)).rejects.toBeDefined()
    return logs
  }

  it('rejects invalid config instead of connecting', async () => {
    await reject({})
    await reject({ transport: {} })
    await reject({ transport: pair.mainTransport, expose: [''] })
    await reject({ transport: pair.mainTransport, timeout: -1 })
    await reject({ transport: pair.mainTransport, typo: true })
    await reject({ transport: pair.mainTransport, import: [{ name: 'a' }] })
    await flush()
    expect(peer.of('hello')).toEqual([])
  })

  it('rejects duplicate or conflicting services', async () => {
    await reject({ transport: pair.mainTransport, expose: ['vault', { name: 'vault' }] })
    await reject({ transport: pair.mainTransport, import: ['vault', { name: 'other', as: 'vault' }] })
    await reject({ transport: pair.mainTransport, import: ['vault', { name: 'vault', as: 'other' }] })
    await reject({ transport: pair.mainTransport, expose: ['vault'], import: [{ name: 'x', as: 'vault' }] })
    await flush()
    expect(peer.of('hello')).toEqual([])
  })
})
