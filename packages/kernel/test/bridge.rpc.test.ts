import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bridge, BridgeError } from '@diabase/kernel'
import { captureLogs, createPair, flush, until } from './helpers/bridge.ts'
import type { Pair } from './helpers/bridge.ts'
import { Vault, deferred } from './helpers/services.ts'
import type { BridgeConfig } from '@diabase/kernel'

let pair: Pair
let vault: Vault

/** Main exposes `vault`, renderer imports it; resolves once the renderer proxy exists. */
async function connect(options: { main?: Partial<BridgeConfig>; renderer?: Partial<BridgeConfig> } = {}) {
  const provider = pair.main.plugin(Vault)
  await provider
  vault = pair.main.get('vault') as unknown as Vault
  await pair.main.plugin(Bridge, { transport: pair.mainTransport, name: 'main', expose: ['vault'], ...options.main })
  await pair.renderer.plugin(Bridge, {
    transport: pair.rendererTransport,
    name: 'renderer',
    import: ['vault'],
    ...options.renderer,
  })
  await until(() => pair.renderer.get('vault'), 'renderer vault proxy')
  return { provider, remote: pair.renderer.get('vault') as any }
}

beforeEach(() => {
  pair = createPair()
})
afterEach(() => {
  vi.useRealTimers()
  pair.close()
})

describe('bridge calls', () => {
  it('round-trips prototype, inherited, arrow-property and sync methods', async () => {
    const { remote } = await connect()
    expect(await remote.info()).toEqual({ id: 'v', name: 'fake' })
    expect(await remote.inherited()).toBe('inherited')
    expect(await remote.stat('a.md')).toEqual({ path: 'a.md', size: 3 })
    const sync = remote.add(2, 3)
    expect(sync).toBeInstanceOf(Promise)
    expect(await sync).toBe(5)
  })

  it('does not announce private, accessor or Cordis-internal members', async () => {
    const { remote } = await connect()
    expect(Object.keys(remote).sort()).toEqual(
      ['add', 'echo', 'hang', 'info', 'inherited', 'never', 'read', 'returnFunction', 'stat', 'throwString', 'throwWithCause', 'typeError'].sort(),
    )
    for (const hidden of ['_private', 'accessor', 'ctx', 'name', 'constructor', 'then']) {
      expect(Object.hasOwn(remote, hidden)).toBe(false)
    }
    expect(remote.then).toBeUndefined()
  })

  it('round-trips nested objects, Date, Map, Set and typed arrays', async () => {
    const { remote } = await connect()
    const value = {
      nested: { list: [1, 'two', { three: 3 }], nil: null },
      date: new Date('2026-01-02T03:04:05.678Z'),
      map: new Map<string, unknown>([['k', { v: [1, 2] }]]),
      set: new Set([1, 2, 3]),
      big: 12345678901234567890n,
    }
    const echoed = await remote.echo(value)
    expect(echoed).toEqual(value)
    expect(echoed.date).toBeInstanceOf(Date)
    expect(echoed.map).toBeInstanceOf(Map)
    expect(echoed.set).toBeInstanceOf(Set)
  })

  it('round-trips Uint8Array byte-exactly, including large buffers', async () => {
    const { remote } = await connect()
    const bytes = new Uint8Array(1 << 20)
    for (let i = 0; i < bytes.length; i++) bytes[i] = (i * 31 + 7) & 0xff
    const echoed = await remote.echo(bytes)
    expect(echoed).toBeInstanceOf(Uint8Array)
    expect(Buffer.compare(Buffer.from(echoed), Buffer.from(bytes))).toBe(0)
    // Node Buffers cross as Uint8Array.
    const fromBuffer = await remote.echo(Buffer.from([1, 2, 3, 255]))
    expect(Array.from(fromBuffer as Uint8Array)).toEqual([1, 2, 3, 255])
  })

  it('does not mix up concurrent calls', async () => {
    const { remote } = await connect()
    const results = await Promise.all(Array.from({ length: 200 }, (_, i) => remote.echo(i)))
    expect(results).toEqual(Array.from({ length: 200 }, (_, i) => i))
  })

  it('keeps `this` of the service for prototype methods', async () => {
    const { remote } = await connect()
    vault.calls.push('x')
    // `hang` uses this.started/this.gate; it only works if `this` is the service.
    vault.gate = deferred()
    const pending = remote.hang()
    await vault.started.promise
    vault.gate.resolve()
    expect(await pending).toBe('done')
  })
})

describe('bridge errors', () => {
  it('rehydrates a thrown VaultError with name, code, path and message', async () => {
    const { remote } = await connect()
    const error = await remote.read('missing.md').catch((e: unknown) => e)
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ name: 'VaultError', code: 'ENOENT', path: 'missing.md', message: 'no such file: missing.md' })
  })

  it('rehydrates native errors, strings and causes', async () => {
    const { remote } = await connect()
    await expect(remote.typeError()).rejects.toBeInstanceOf(TypeError)
    const fromString = await remote.throwString().catch((e: unknown) => e)
    expect(fromString).toBeInstanceOf(Error)
    expect((fromString as Error).message).toBe('plain string')
    const withCause = await remote.throwWithCause().catch((e: Error) => e)
    expect(withCause.message).toBe('outer')
    expect(withCause.cause).toBeInstanceOf(RangeError)
  })

  it('rejects calls rejected by the guard, before the method runs', async () => {
    const guard = vi.fn((method: string, args: unknown[]) => {
      if (method === 'read') throw new VaultGuardError(String(args[0]))
    })
    const { remote } = await connect({ main: { expose: [{ name: 'vault', guard }] } })
    const spy = vi.spyOn(vault, 'read')
    const error = await remote.read('secret.md').catch((e: unknown) => e)
    expect(error).toMatchObject({ name: 'GuardError', message: 'denied secret.md' })
    expect(spy).not.toHaveBeenCalled()
    expect(guard).toHaveBeenCalledWith('read', ['secret.md'])
    expect(await remote.add(1, 1)).toBe(2)
  })

  it('awaits an async guard', async () => {
    const gate = deferred()
    const { remote } = await connect({
      main: { expose: [{ name: 'vault', guard: () => gate.promise.then(() => { throw new Error('late deny') }) }] },
    })
    const spy = vi.spyOn(vault, 'add')
    const outcome = remote.add(1, 2).catch((e: Error) => e.message)
    await flush()
    expect(spy).not.toHaveBeenCalled()
    gate.resolve()
    expect(await outcome).toBe('late deny')
    expect(spy).not.toHaveBeenCalled()
  })

  it('limits exposed methods to an explicit list', async () => {
    const { remote } = await connect({ main: { expose: [{ name: 'vault', methods: ['add'] }] } })
    expect(Object.keys(remote)).toEqual(['add'])
    expect(await remote.add(1, 1)).toBe(2)
  })

  it('rejects with EDATACLONE when arguments cannot be cloned', async () => {
    const { remote } = await connect()
    const error = await remote.echo(() => 1).catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BridgeError)
    expect(error).toMatchObject({ code: 'EDATACLONE' })
    // The bridge is still healthy afterwards.
    expect(await remote.add(1, 2)).toBe(3)
  })

  it('answers EDATACLONE when the return value cannot be cloned instead of hanging', async () => {
    const { remote } = await connect()
    const error = await remote.returnFunction().catch((e: unknown) => e)
    expect(error).toBeInstanceOf(BridgeError)
    expect(error).toMatchObject({ code: 'EDATACLONE' })
    expect(await remote.add(1, 2)).toBe(3)
  })

  it('rejects with ETIMEOUT, and clears the timer when calls settle', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { remote } = await connect({ renderer: { timeout: 1000 } })
    expect(vi.getTimerCount()).toBe(0)
    expect(await remote.add(1, 2)).toBe(3)
    expect(vi.getTimerCount()).toBe(0)

    const outcome = remote.never().catch((e: unknown) => e)
    await vault.started.promise
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(999)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    const error = await outcome
    expect(error).toBeInstanceOf(BridgeError)
    expect(error).toMatchObject({ code: 'ETIMEOUT' })
    expect(vi.getTimerCount()).toBe(0)
  })

  it('honors per-method timeout overrides, 0 meaning none', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { remote } = await connect({ renderer: { timeout: 100, timeouts: { 'vault.hang': 0, 'vault.never': 500 } } })
    const slow = remote.hang()
    await vault.started.promise
    expect(vi.getTimerCount()).toBe(0)
    await vi.advanceTimersByTimeAsync(60_000)
    vault.gate!.resolve()
    expect(await slow).toBe('done')

    vault.started = deferred()
    const outcome = remote.never().catch((e: unknown) => e)
    await vault.started.promise
    await vi.advanceTimersByTimeAsync(499)
    expect(vi.getTimerCount()).toBe(1)
    await vi.advanceTimersByTimeAsync(1)
    expect(await outcome).toMatchObject({ code: 'ETIMEOUT' })
  })

  it('applies no timeout at all when timeout is 0', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { remote } = await connect({ renderer: { timeout: 0 } })
    const slow = remote.hang()
    await vault.started.promise
    expect(vi.getTimerCount()).toBe(0)
    vault.gate!.resolve()
    expect(await slow).toBe('done')
  })

  it('ignores a result that arrives after the call timed out', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const logs = captureLogs(pair.renderer)
    const { remote } = await connect({ renderer: { timeout: 50 } })
    const outcome = remote.hang().catch((e: BridgeError) => e.code)
    await vault.started.promise
    await vi.advanceTimersByTimeAsync(50)
    expect(await outcome).toBe('ETIMEOUT')
    vault.gate!.resolve()
    await flush()
    expect(logs.some((m) => m.type === 'error')).toBe(false)
    expect(await remote.add(1, 1)).toBe(2)
  })
})

class VaultGuardError extends Error {
  override name = 'GuardError'
  constructor(path: string) {
    super(`denied ${path}`)
  }
}
