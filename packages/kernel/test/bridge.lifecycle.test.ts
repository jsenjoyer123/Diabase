// Pins that Cordis' dependent/provider lifecycle (see lifecycle.test.ts) holds across the bridge.
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { Bridge, Context, REMOTE_MARKER, Service } from '@diabase/kernel'
import type { BridgeConfig, BridgeStatus } from '@diabase/kernel'
import { captureLogs, createPair, flush, until } from './helpers/bridge.ts'
import type { Pair } from './helpers/bridge.ts'
import { Slots, Vault, deferred } from './helpers/services.ts'

let pair: Pair

const mainConfig = (extra: Partial<BridgeConfig> = {}): BridgeConfig => ({
  transport: pair.mainTransport,
  name: 'main',
  expose: ['vault'],
  ...extra,
})
const rendererConfig = (extra: Partial<BridgeConfig> = {}): BridgeConfig => ({
  transport: pair.rendererTransport,
  name: 'renderer',
  import: ['vault'],
  ...extra,
})

function consumer(log: string[], extra: (ctx: Context) => void = () => {}) {
  return {
    name: 'consumer',
    inject: ['vault'],
    apply(ctx: Context) {
      log.push('apply')
      ctx.effect(() => () => void log.push('dispose'))
      extra(ctx)
    },
  }
}

function watchStatus(ctx: Context) {
  const list: BridgeStatus[] = []
  ctx.on('bridge/status', (status) => void list.push(status))
  return list
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

beforeEach(() => {
  pair = createPair()
})
afterEach(() => {
  vi.useRealTimers()
  pair.close()
})

describe('proxy lifecycle', () => {
  it('provides no proxy before connect or while the origin service is absent', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    const rendererStatus = watchStatus(renderer)
    renderer.plugin(consumer(log))

    // Not connected: the peer bridge does not exist yet.
    await renderer.plugin(Bridge, rendererConfig())
    await flush()
    expect(renderer.get('vault')).toBeUndefined()
    expect(rendererStatus).toEqual([])

    // Connected, but no vault on main.
    await main.plugin(Bridge, mainConfig())
    await until(() => rendererStatus.at(-1)?.connected, 'connect')
    await flush()
    expect(renderer.get('vault')).toBeUndefined()
    expect(rendererStatus.at(-1)).toEqual({ name: 'renderer', connected: true, remote: [{ name: 'vault', local: 'vault', up: false }], exposed: [] })
    expect(log).toEqual([])

    // The vault appears: the renderer dependent applies.
    await main.plugin(Vault)
    await until(() => log.length, 'dependent apply')
    expect(log).toEqual(['apply'])
    expect(renderer.get('vault')).toBeDefined()
    expect(rendererStatus.at(-1)?.remote).toEqual([{ name: 'vault', local: 'vault', up: true }])
  })

  it.each(['main first', 'renderer first'] as const)('connects regardless of plug order (%s)', async (order) => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin(consumer(log))
    await main.plugin(Vault)
    const plugMain = () => main.plugin(Bridge, mainConfig())
    const plugRenderer = () => renderer.plugin(Bridge, rendererConfig())
    if (order === 'main first') {
      await plugMain()
      await flush()
      await plugRenderer()
    } else {
      await plugRenderer()
      await flush()
      await plugMain()
    }
    await until(() => log.length, 'dependent apply')
    expect(log).toEqual(['apply'])
    expect(await renderer.get('vault')!.info()).toEqual({ id: 'v', name: 'fake' })
  })

  it('disposes the renderer dependent when the main provider goes down and re-applies it when it returns', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin(consumer(log))
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length, 'first apply')
    expect(log).toEqual(['apply'])

    await provider.dispose()
    expect(log).toEqual(['apply', 'dispose'])
    expect(renderer.get('vault')).toBeUndefined()

    await main.plugin(Vault)
    await until(() => log.length === 3, 'second apply')
    expect(log).toEqual(['apply', 'dispose', 'apply'])
    expect(await renderer.get('vault')!.info()).toEqual({ id: 'v', name: 'fake' })
  })

  it('restarts the renderer dependent on a hot swap (registry.delete + re-plug on main)', async () => {
    const { main, renderer } = pair
    class VaultV2 extends Vault {
      override async info() {
        return { id: 'v2', name: 'swapped' }
      }
    }
    const log: string[] = []
    renderer.plugin(consumer(log))
    const v1 = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length, 'first apply')

    main.registry.delete(Vault)
    // Unloading now takes a round trip to the renderer (the dependents must leave first), so the
    // replacement may only be plugged once the old fiber is gone; otherwise Cordis rejects it with
    // "service has been registered".
    await v1
    expect(log).toEqual(['apply', 'dispose'])
    await main.plugin(VaultV2)
    await until(() => log.length === 3, 'second apply')
    expect(log).toEqual(['apply', 'dispose', 'apply'])
    expect(await renderer.get('vault')!.info()).toEqual({ id: 'v2', name: 'swapped' })
  })

  it('survives rapid down/up cycles without Cordis registration errors', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    const logs = captureLogs(renderer)
    renderer.plugin(consumer(log))
    await main.plugin(Bridge, mainConfig({ releaseTimeout: 5000 }))
    await renderer.plugin(Bridge, rendererConfig())
    for (let i = 0; i < 5; i++) {
      const provider = main.plugin(Vault)
      await provider
      await provider.dispose()
    }
    await main.plugin(Vault)
    await until(() => renderer.get('vault'), 'final proxy')
    expect(await renderer.get('vault')!.info()).toEqual({ id: 'v', name: 'fake' })
    expect(logs.filter((m) => m.type === 'error' || m.type === 'warn')).toEqual([])
    await until(() => log.at(-1) === 'apply', 'dependent settled')
    expect(log.filter((entry) => entry === 'apply').length).toBe(log.filter((entry) => entry === 'dispose').length + 1)
  })

  it('reports status on connect, remote up/down and disconnect', async () => {
    const { main, renderer } = pair
    const mainStatus = watchStatus(main)
    const rendererStatus = watchStatus(renderer)
    const project = (list: BridgeStatus[]) => {
      const states = list.map((s) => `${s.connected ? 'connected' : 'disconnected'}:${s.remote[0]?.up ? 'up' : 'down'}:${s.exposed.join(',')}`)
      return states.filter((state, i) => state !== states[i - 1])
    }
    const provider = main.plugin(Vault)
    const mainBridge = main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')
    await provider.dispose()
    await main.plugin(Vault)
    await until(() => renderer.get('vault'), 'proxy again')
    await mainBridge.dispose()
    await flush()

    expect(project(rendererStatus)).toEqual([
      'connected:down:',
      'connected:up:',
      'connected:down:',
      'connected:up:',
      'disconnected:down:',
    ])
    expect(mainStatus.map((s) => s.name)).toEqual(Array(mainStatus.length).fill('main'))
    expect(project(mainStatus)[0]).toBe('connected:down:vault')
    expect(project(mainStatus).at(-1)).toBe('disconnected:down:')
  })
})

describe('drain ordering', () => {
  it('lets renderer dependents call the service from their disposers, and holds the provider until they finish', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(ctx: Context) {
        ctx.effect(() => async () => {
          log.push(`dispose:start visible=${ctx.get('vault') !== undefined}`)
          const info = await ctx.vault.info()
          log.push(`dispose:call ${info.id}`)
          await sleep(20)
          log.push('dispose:end')
        })
      },
    })
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')
    const vault = main.get('vault') as unknown as Vault
    const info = vi.spyOn(vault, 'info')

    await provider.dispose()
    log.push('provider:disposed')
    expect(log).toEqual(['dispose:start visible=false', 'dispose:call v', 'dispose:end', 'provider:disposed'])
    expect(info).toHaveBeenCalledTimes(1)
  })

  it('finishes the provider after releaseTimeout when the peer never releases', async () => {
    vi.useFakeTimers({ toFake: ['setTimeout', 'clearTimeout'] })
    const { main, renderer } = pair
    const stuck = deferred()
    const log: string[] = []
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(ctx: Context) {
        ctx.effect(() => async () => {
          log.push('dispose:start')
          await stuck.promise
        })
      },
    })
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig({ releaseTimeout: 2500 }))
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')

    let done = false
    const disposal = provider.dispose().then(() => (done = true))
    await until(() => log.length, 'dependent disposer started')
    await vi.advanceTimersByTimeAsync(2499)
    expect(done).toBe(false)
    await vi.advanceTimersByTimeAsync(1)
    await disposal
    expect(done).toBe(true)
    expect(vi.getTimerCount()).toBe(0)
    stuck.resolve()
  })

  it('finishes the provider when the peer disconnects while it is draining', async () => {
    const { main, renderer } = pair
    const stuck = deferred()
    const started = deferred()
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(ctx: Context) {
        ctx.effect(() => async () => {
          started.resolve()
          await stuck.promise
        })
      },
    })
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig({ releaseTimeout: 60_000 }))
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')

    const disposal = provider.dispose()
    await started.promise
    pair.rendererPort.close()
    await disposal
    stuck.resolve()
  })

  it('does not hold the provider for peers that do not import the service', async () => {
    const { main, renderer } = pair
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig({ releaseTimeout: 60_000 }))
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, name: 'renderer' })
    await flush()
    // Would take 60s (the test would time out) if the peer's missing `released` was waited for.
    await provider.dispose()
  })

  it('does not wait at all when releaseTimeout is 0', async () => {
    const { main, renderer } = pair
    const stuck = deferred()
    const started = deferred()
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(ctx: Context) {
        ctx.effect(() => async () => {
          started.resolve()
          await stuck.promise
        })
      },
    })
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig({ releaseTimeout: 0 }))
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')
    await provider.dispose()
    await started.promise
    stuck.resolve()
  })
})

describe('in-flight calls and disconnects', () => {
  it('rejects a call pending while the service goes down with ESERVICEDOWN', async () => {
    const { main, renderer } = pair
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')
    const vault = main.get('vault') as unknown as Vault
    const remote = renderer.get('vault') as any

    const outcome = remote.hang().catch((e: unknown) => e)
    await vault.started.promise
    await provider.dispose()
    expect(await outcome).toMatchObject({ name: 'BridgeError', code: 'ESERVICEDOWN' })
  })

  it('rejects calls on a withdrawn proxy immediately', async () => {
    const { main, renderer } = pair
    const provider = main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')
    const stale = renderer.get('vault') as any

    await provider.dispose()
    await expect(stale.info()).rejects.toMatchObject({ code: 'ESERVICEDOWN' })
  })

  it('fails in-flight calls with EDISCONNECTED and sends dependents PENDING when the main bridge is disposed', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin(consumer(log))
    await main.plugin(Vault)
    const mainBridge = main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length, 'dependent apply')
    const vault = main.get('vault') as unknown as Vault
    const remote = renderer.get('vault') as any

    const outcome = remote.hang().catch((e: unknown) => e)
    await vault.started.promise
    await mainBridge.dispose()
    expect(await outcome).toMatchObject({ name: 'BridgeError', code: 'EDISCONNECTED' })

    await until(() => log.length === 2, 'dependent dispose')
    expect(log).toEqual(['apply', 'dispose'])
    expect(renderer.get('vault')).toBeUndefined()
    await expect(remote.info()).rejects.toMatchObject({ code: 'EDISCONNECTED' })
  })

  it('re-handshakes when the main bridge is re-plugged on the same transport', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin(consumer(log))
    await main.plugin(Vault)
    const first = main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length, 'first apply')

    await first.dispose()
    await until(() => log.length === 2, 'dependent disposed')
    expect(renderer.get('vault')).toBeUndefined()

    await main.plugin(Bridge, mainConfig())
    await until(() => log.length === 3, 'dependent re-applied')
    expect(log).toEqual(['apply', 'dispose', 'apply'])
    expect(await renderer.get('vault')!.info()).toEqual({ id: 'v', name: 'fake' })
  })

  it('re-handshakes when the renderer bridge is re-plugged on the same transport', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin(consumer(log))
    await main.plugin(Vault)
    const mainStatus = watchStatus(main)
    await main.plugin(Bridge, mainConfig())
    const first = renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length, 'first apply')

    await first.dispose()
    await until(() => !mainStatus.at(-1)?.connected, 'main sees the disconnect')
    await until(() => log.length === 2, 'dependent disposed')

    await renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length === 3, 'dependent re-applied')
    await until(() => mainStatus.at(-1)?.connected, 'main reconnected')
    expect(await renderer.get('vault')!.info()).toEqual({ id: 'v', name: 'fake' })
  })

  it('treats a closed transport as a disconnect', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin(consumer(log))
    await main.plugin(Vault)
    const mainStatus = watchStatus(main)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await until(() => log.length, 'apply')
    const remote = renderer.get('vault') as any

    pair.mainPort.close()
    await until(() => log.length === 2, 'dependent disposed')
    expect(renderer.get('vault')).toBeUndefined()
    expect(mainStatus.at(-1)?.connected).toBe(false)
    await expect(remote.info()).rejects.toMatchObject({ code: 'EDISCONNECTED' })
  })

  it('disposing a renderer bridge waits for its dependents, which can still call main', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(ctx: Context) {
        ctx.effect(() => async () => {
          log.push(`dispose:call ${(await ctx.vault.info()).id}`)
        })
      },
    })
    await main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    const bridge = renderer.plugin(Bridge, rendererConfig())
    await until(() => renderer.get('vault'), 'proxy')

    await bridge.dispose()
    expect(log).toEqual(['dispose:call v'])
  })
})

describe('bidirectional bridges', () => {
  it('exposes a renderer service to main while main exposes vault', async () => {
    const { main, renderer } = pair
    const mainLog: string[] = []
    const rendererLog: string[] = []
    main.plugin({
      name: 'agent',
      inject: ['slots'],
      apply(ctx: Context) {
        mainLog.push('apply')
        ctx.effect(() => () => void mainLog.push('dispose'))
      },
    })
    renderer.plugin(consumer(rendererLog))
    await main.plugin(Vault)
    await main.plugin(Bridge, mainConfig({ import: ['slots'] }))
    await renderer.plugin(Bridge, rendererConfig({ expose: ['slots'] }))
    await flush()
    expect(mainLog).toEqual([])
    expect(rendererLog).toEqual(['apply'])

    const slots = renderer.plugin(Slots)
    await until(() => mainLog.length, 'main dependent apply')
    const [catalog, info] = await Promise.all([(main.get('slots') as any).getCatalog(), (renderer.get('vault') as any).info()])
    expect(catalog).toEqual(['editor', 'files'])
    expect(info).toEqual({ id: 'v', name: 'fake' })

    await slots.dispose()
    expect(mainLog).toEqual(['apply', 'dispose'])
    expect(rendererLog).toEqual(['apply'])
    expect(await (renderer.get('vault') as any).info()).toEqual({ id: 'v', name: 'fake' })
  })

  it('lets main dependents drain through renderer-exposed services too', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    main.plugin({
      name: 'agent',
      inject: ['slots'],
      apply(ctx: Context) {
        ctx.effect(() => async () => {
          log.push(`dispose:call ${(await (ctx as any).slots.getCatalog()).length}`)
        })
      },
    })
    await main.plugin(Bridge, mainConfig({ expose: [], import: ['slots'] }))
    await renderer.plugin(Bridge, rendererConfig({ import: [], expose: ['slots'] }))
    const slots = renderer.plugin(Slots)
    await until(() => main.get('slots'), 'slots proxy')
    await slots.dispose()
    log.push('slots:disposed')
    expect(log).toEqual(['dispose:call 2', 'slots:disposed'])
  })
})

describe('import aliases and filtering', () => {
  class Inspector extends Service {
    constructor(ctx: Context) {
      super(ctx, 'inspector')
    }
    async tree() {
      return ['fiber']
    }
  }
  class Secret extends Service {
    constructor(ctx: Context) {
      super(ctx, 'secret')
    }
    async reveal() {
      return 'hunter2'
    }
  }

  it('provides aliased imports under the local name and ignores services that are not imported', async () => {
    const { main, renderer } = pair
    const log: string[] = []
    renderer.plugin({ name: 'aliased', inject: ['mainInspector'], apply: () => void log.push('apply') })
    renderer.plugin({ name: 'leaky', inject: ['secret'], apply: () => void log.push('leak') })
    renderer.plugin({ name: 'unaliased', inject: ['inspector'], apply: () => void log.push('unaliased') })
    await main.plugin(Inspector)
    await main.plugin(Secret)
    await main.plugin(Vault)
    await main.plugin(Bridge, mainConfig({ expose: ['inspector', 'secret', 'vault'] }))
    await renderer.plugin(Bridge, rendererConfig({ import: [{ name: 'inspector', as: 'mainInspector' }, 'vault'] }))
    await until(() => renderer.get('mainInspector'), 'alias')
    await flush()

    expect(log).toEqual(['apply'])
    expect(renderer.get('inspector')).toBeUndefined()
    expect(renderer.get('secret')).toBeUndefined()
    expect(await (renderer.get('mainInspector') as any).tree()).toEqual(['fiber'])
    expect(renderer.get('vault')).toBeDefined()
  })
})

describe('local name collisions', () => {
  it('logs an error instead of throwing when the proxy name is already provided locally', async () => {
    const { main, renderer } = pair
    const logs = captureLogs(renderer)
    await renderer.plugin(Vault)
    await main.plugin(Vault)
    await main.plugin(Bridge, mainConfig())
    await renderer.plugin(Bridge, rendererConfig())
    await flush()
    expect(logs.some((m) => m.type === 'error' && String(m.args[0]).includes('cannot provide "vault"'))).toBe(true)
    expect(renderer.get('vault')).toBeDefined()
    expect((renderer.get('vault') as any)[REMOTE_MARKER]).toBeUndefined()
  })
})
