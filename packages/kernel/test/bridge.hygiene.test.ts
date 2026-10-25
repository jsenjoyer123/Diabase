// A disposed bridge must leave nothing behind (docs/architecture.md §9).
import { EventEmitter } from 'node:events'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bridge, Context, electronPortTransport, messagePortTransport } from '@diabase/kernel'
import type { MessagePortMainLike } from '@diabase/kernel'
import { createFakePair, createPair, flush, until } from './helpers/bridge.ts'
import type { Pair } from './helpers/bridge.ts'
import { Vault, deferred } from './helpers/services.ts'

let pair: Pair
beforeEach(() => {
  pair = createPair()
})
afterEach(() => {
  vi.useRealTimers()
  pair.close()
})

describe('dispose hygiene', () => {
  it.each(['renderer first', 'main first'] as const)(
    'leaves no listeners, timers, proxies or sends behind (%s)',
    async (order) => {
      vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
      const [mainTransport, rendererTransport] = createFakePair()
      const { main, renderer } = pair
      const log: string[] = []
      renderer.plugin({ name: 'consumer', inject: ['vault'], apply: () => void log.push('apply') })
      await main.plugin(Vault)
      const vault = main.get('vault') as unknown as Vault
      const mainBridge = main.plugin(Bridge, {
        transport: mainTransport,
        name: 'main',
        expose: ['vault'],
        forward: ['vault/changed'],
        accept: ['slots/changed'],
      })
      const rendererBridge = renderer.plugin(Bridge, {
        transport: rendererTransport,
        name: 'renderer',
        import: ['vault'],
        forward: ['slots/changed'],
        accept: ['vault/changed'],
      })
      await until(() => log.length, 'dependent apply')
      expect(mainTransport.messageListeners).toBe(1)
      expect(rendererTransport.closeListeners).toBe(1)

      const outcome = (renderer.get('vault') as any).hang().catch((e: any) => e.code)
      await vault.started.promise
      expect(vi.getTimerCount()).toBe(1) // the call timeout

      const [first, second] = order === 'renderer first' ? [rendererBridge, mainBridge] : [mainBridge, rendererBridge]
      await first.dispose()
      await second.dispose()
      await flush()

      expect(await outcome).toMatch(/^E(DISPOSED|DISCONNECTED)$/)
      for (const transport of [mainTransport, rendererTransport]) {
        expect(transport.messageListeners).toBe(0)
        expect(transport.closeListeners).toBe(0)
      }
      expect(vi.getTimerCount()).toBe(0)
      expect(renderer.get('vault')).toBeUndefined()
      expect(log).toEqual(['apply'])

      // Nothing is forwarded or sent any more.
      const sent = [mainTransport.sent.length, rendererTransport.sent.length]
      main.emit('vault/changed', [])
      renderer.emit('slots/changed')
      await flush()
      expect([mainTransport.sent.length, rendererTransport.sent.length]).toEqual(sent)
    },
  )

  it('rejects in-flight calls with EDISPOSED when the calling bridge is disposed', async () => {
    const { main, renderer } = pair
    await main.plugin(Vault)
    const vault = main.get('vault') as unknown as Vault
    await main.plugin(Bridge, { transport: pair.mainTransport, expose: ['vault'] })
    const bridge = renderer.plugin(Bridge, { transport: pair.rendererTransport, import: ['vault'] })
    await until(() => renderer.get('vault'), 'proxy')
    const remote = renderer.get('vault') as any

    const outcome = remote.hang().catch((e: any) => e)
    await vault.started.promise
    await bridge.dispose()
    expect(await outcome).toMatchObject({ name: 'BridgeError', code: 'EDISPOSED' })
    await expect(remote.info()).rejects.toMatchObject({ code: 'EDISPOSED' })
  })

  it('clears release timers and finishes a draining provider when the bridge is disposed', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { main, renderer } = pair
    const stuck = deferred()
    const started = deferred()
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply: (ctx: Context) => void ctx.effect(() => async () => {
        started.resolve()
        await stuck.promise
      }),
    })
    const provider = main.plugin(Vault)
    const mainBridge = main.plugin(Bridge, { transport: pair.mainTransport, expose: ['vault'], releaseTimeout: 60_000 })
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, import: ['vault'] })
    await until(() => renderer.get('vault'), 'proxy')

    const disposal = provider.dispose()
    await started.promise
    expect(vi.getTimerCount()).toBe(1) // the release timeout
    await mainBridge.dispose()
    await disposal
    expect(vi.getTimerCount()).toBe(0)
    stuck.resolve()
  })

  it('clears the release timer once the peer releases', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { main, renderer } = pair
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, { transport: pair.mainTransport, expose: ['vault'] })
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, import: ['vault'] })
    await until(() => renderer.get('vault'), 'proxy')
    await provider.dispose()
    expect(vi.getTimerCount()).toBe(0)
  })

  it('removes its Cordis registrations when disposed', async () => {
    const { main } = pair
    const hooks = () => Object.keys(main.events._hooks).filter((name) => name.startsWith('vault/') || name.startsWith('bridge'))
    const bridge = main.plugin(Bridge, { transport: pair.mainTransport, expose: ['vault'], forward: ['vault/changed'] })
    await bridge
    expect(hooks()).toEqual(['vault/changed'])
    expect(bridge.getEffects().length).toBeGreaterThan(0)
    await bridge.dispose()
    expect(hooks()).toEqual([])
    expect(bridge.getEffects()).toEqual([])
    expect(main.registry.size).toBe(0)
  })

  it('can be re-plugged on the same transport any number of times without leaking listeners', async () => {
    const [mainTransport] = createFakePair()
    for (let i = 0; i < 5; i++) {
      const bridge = pair.main.plugin(Bridge, { transport: mainTransport, expose: ['vault'], forward: ['vault/changed'] })
      await bridge
      expect(mainTransport.messageListeners).toBe(1)
      await bridge.dispose()
      expect(mainTransport.messageListeners).toBe(0)
      expect(mainTransport.closeListeners).toBe(0)
    }
  })
})

describe('transport ownership', () => {
  const closes = async (ownsTransport: boolean | undefined) => {
    const [transport] = createFakePair()
    const bridge = pair.main.plugin(Bridge, { transport, ownsTransport })
    await bridge
    expect(transport.closed).toBe(false)
    await bridge.dispose()
    return transport.closed
  }

  it('leaves the transport open by default and when ownsTransport is false', async () => {
    expect(await closes(undefined)).toBe(false)
    expect(await closes(false)).toBe(false)
  })

  it('closes the transport after teardown when ownsTransport is true', async () => {
    expect(await closes(true)).toBe(true)
  })

  it('closes the real port only when it owns it', async () => {
    const closed = vi.spyOn(pair.mainPort, 'close')
    const kept = pair.main.plugin(Bridge, { transport: pair.mainTransport })
    await kept
    await kept.dispose()
    expect(closed).not.toHaveBeenCalled()

    const owned = pair.main.plugin(Bridge, { transport: messagePortTransport(pair.mainPort), ownsTransport: true })
    await owned
    await owned.dispose()
    expect(closed).toHaveBeenCalledTimes(1)
  })

  it('closes the transport even when a service is still draining', async () => {
    const [mainTransport] = createFakePair()
    const { main } = pair
    const provider = main.plugin(Vault)
    const bridge = main.plugin(Bridge, { transport: mainTransport, expose: ['vault'], ownsTransport: true })
    await bridge
    await bridge.dispose()
    await provider.dispose()
    expect(mainTransport.closed).toBe(true)
  })
})

/** Electron's `MessagePortMain` as the bridge sees it: an EventEmitter with `{ data }` events. */
class FakeMainPort extends EventEmitter {
  started = 0
  closed = false
  peer?: FakeMainPort
  postMessage(message: unknown) {
    const peer = this.peer!
    const data = structuredClone(message)
    queueMicrotask(() => peer.emit('message', { data, ports: [] }))
  }
  start() {
    this.started++
  }
  close() {
    if (this.closed) return
    this.closed = true
    this.emit('close')
    queueMicrotask(() => this.peer?.close())
  }
}

describe('electronPortTransport', () => {
  function ports() {
    const a = new FakeMainPort()
    const b = new FakeMainPort()
    a.peer = b
    b.peer = a
    return [a, b] as const
  }

  it('unwraps { data }, starts the port, and removes its listeners', async () => {
    const [a, b] = ports()
    const transport = electronPortTransport(a as unknown as MessagePortMainLike)
    const received: unknown[] = []
    const off = transport.onMessage((message) => void received.push(message))
    const offClose = transport.onClose!(() => {})
    expect(a.started).toBe(1)
    expect(a.listenerCount('message')).toBe(1)
    expect(a.listenerCount('close')).toBe(1)

    b.postMessage({ hello: [1, 2, 3] })
    await flush()
    expect(received).toEqual([{ hello: [1, 2, 3] }])

    transport.send({ out: true })
    const echoed: unknown[] = []
    b.on('message', (event) => void echoed.push(event.data))
    await flush()
    expect(echoed).toEqual([{ out: true }])

    off()
    offClose()
    expect(a.listenerCount('message')).toBe(0)
    expect(a.listenerCount('close')).toBe(0)
  })

  it('runs a full bridge over Electron-style ports, and a close event disconnects it', async () => {
    const [a, b] = ports()
    const { main, renderer } = pair
    const log: string[] = []
    const statuses: boolean[] = []
    renderer.on('bridge/status', (status) => void statuses.push(status.connected))
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply: (ctx: Context) => {
        log.push('apply')
        ctx.effect(() => () => void log.push('dispose'))
      },
    })
    await main.plugin(Vault)
    await main.plugin(Bridge, {
      transport: electronPortTransport(a as unknown as MessagePortMainLike),
      name: 'main',
      expose: ['vault'],
      forward: ['vault/changed'],
    })
    await renderer.plugin(Bridge, {
      transport: electronPortTransport(b as unknown as MessagePortMainLike),
      name: 'renderer',
      import: ['vault'],
      accept: ['vault/changed'],
    })
    await until(() => log.length, 'dependent apply')
    expect(a.started).toBe(1)
    expect(b.started).toBe(1)
    expect(await (renderer.get('vault') as any).stat('x.md')).toEqual({ path: 'x.md', size: 3 })

    const events: unknown[] = []
    renderer.on('vault/changed', (e) => void events.push(e))
    main.emit('vault/changed', [])
    await until(() => events.length, 'forwarded event')

    a.close()
    await until(() => log.length === 2, 'dependent disposed after close')
    expect(renderer.get('vault')).toBeUndefined()
    expect(statuses.at(-1)).toBe(false)
  })

  it('is not confused by transfer lists', () => {
    const [a] = ports()
    const posted: unknown[][] = []
    a.postMessage = (...args: unknown[]) => void posted.push(args)
    const transport = electronPortTransport(a as unknown as MessagePortMainLike)
    transport.send({ x: 1 })
    expect(posted).toEqual([[{ x: 1 }]])
  })
})

describe('messagePortTransport', () => {
  it('delivers data and stops delivering after unsubscribe', async () => {
    const received: unknown[] = []
    const a = messagePortTransport(pair.mainPort)
    const b = messagePortTransport(pair.rendererPort)
    const off = a.onMessage((message) => void received.push(message))
    b.send({ n: 1 })
    await flush()
    expect(received).toEqual([{ n: 1 }])

    off()
    b.send({ n: 2 })
    await flush()
    expect(received).toEqual([{ n: 1 }])
  })

  it('reports peer close once and stops reporting after unsubscribe', async () => {
    const closed = vi.fn()
    const skipped = vi.fn()
    const a = messagePortTransport(pair.mainPort)
    const b = messagePortTransport(pair.rendererPort)
    a.onMessage(() => {})
    a.onClose!(closed)
    a.onClose!(skipped)()
    b.close!()
    await until(() => closed.mock.calls.length, 'close event')
    expect(closed).toHaveBeenCalledTimes(1)
    expect(skipped).not.toHaveBeenCalled()
  })

  it('throws DataCloneError from send for values that cannot be cloned', () => {
    const transport = messagePortTransport(pair.mainPort)
    expect(() => transport.send({ fn: () => 1 })).toThrowError(expect.objectContaining({ name: 'DataCloneError' }))
  })
})
