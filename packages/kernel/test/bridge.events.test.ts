import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { Bridge } from '@diabase/kernel'
import type { VaultEvent } from '@diabase/protocol'
import { captureLogs, createFakePair, createPair, flush, until } from './helpers/bridge.ts'
import type { Pair } from './helpers/bridge.ts'

let pair: Pair
beforeEach(() => {
  pair = createPair()
})
afterEach(() => pair.close())

const connected = (ctx: Pair['main']) => {
  let value = false
  ctx.on('bridge/status', (status) => void (value = status.connected))
  return () => value
}

describe('event forwarding', () => {
  it('forwards vault/changed main -> renderer with its payload', async () => {
    const { main, renderer } = pair
    const isConnected = connected(renderer)
    const seen: VaultEvent[][] = []
    renderer.on('vault/changed', (events) => void seen.push(events))
    await main.plugin(Bridge, { transport: pair.mainTransport, name: 'main', forward: ['vault/changed'] })
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, name: 'renderer', accept: ['vault/changed'] })
    await until(isConnected, 'connect')

    const payload: VaultEvent[] = [
      { type: 'add', path: 'a.md', kind: 'file', origin: 'self' },
      { type: 'rename', from: 'a.md', to: 'b.md', origin: 'external' },
    ]
    main.emit('vault/changed', payload)
    await until(() => seen.length, 'event')
    expect(seen).toEqual([payload])
  })

  it('drops events the receiver does not accept, and events that were never forwarded', async () => {
    const { main, renderer } = pair
    const logs = captureLogs(renderer)
    const isConnected = connected(renderer)
    const seen: string[] = []
    renderer.on('vault/changed', () => void seen.push('vault/changed'))
    renderer.on('index/ready', () => void seen.push('index/ready'))
    renderer.on('genui/event', () => void seen.push('genui/event'))
    await main.plugin(Bridge, { transport: pair.mainTransport, forward: ['vault/changed', 'index/ready'] })
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, accept: ['vault/changed'] })
    await until(isConnected, 'connect')

    main.emit('index/ready')
    main.emit('genui/event', { type: 'status' } as never)
    main.emit('vault/changed', [])
    await until(() => seen.length, 'accepted event')
    await flush()
    expect(seen).toEqual(['vault/changed'])
    expect(logs.some((m) => m.type === 'debug' && String(m.args[0]).includes('"index/ready"'))).toBe(true)
  })

  it('does not echo events when both sides forward and accept the same name', async () => {
    const [mainTransport, rendererTransport] = createFakePair()
    const { main, renderer } = pair
    const counts = { main: 0, renderer: 0 }
    main.on('slots/changed', () => void counts.main++)
    renderer.on('slots/changed', () => void counts.renderer++)
    const both = { forward: ['slots/changed'], accept: ['slots/changed'] }
    await main.plugin(Bridge, { transport: mainTransport, name: 'main', ...both })
    await renderer.plugin(Bridge, { transport: rendererTransport, name: 'renderer', ...both })
    await flush()
    const events = (t: typeof mainTransport) => t.sent.filter((m: any) => m.t === 'event')

    main.emit('slots/changed')
    await flush()
    expect(counts).toEqual({ main: 1, renderer: 1 })
    expect(events(mainTransport).length).toBe(1)
    expect(events(rendererTransport).length).toBe(0)

    renderer.emit('slots/changed')
    await flush()
    expect(counts).toEqual({ main: 2, renderer: 2 })
    expect(events(mainTransport).length).toBe(1)
    expect(events(rendererTransport).length).toBe(1)
  })

  it('still forwards other events emitted synchronously by a listener of a re-emitted event', async () => {
    const [mainTransport, rendererTransport] = createFakePair()
    const { main, renderer } = pair
    const seen: string[] = []
    // The renderer reacts to vault/changed by emitting blocks/changed, which main wants to hear.
    renderer.on('vault/changed', () => renderer.emit('blocks/changed'))
    main.on('blocks/changed', () => void seen.push('blocks/changed'))
    await main.plugin(Bridge, { transport: mainTransport, name: 'main', forward: ['vault/changed'], accept: ['blocks/changed'] })
    await renderer.plugin(Bridge, {
      transport: rendererTransport,
      name: 'renderer',
      forward: ['blocks/changed'],
      accept: ['vault/changed'],
    })
    await flush()
    main.emit('vault/changed', [])
    await until(() => seen.length, 'relayed event')
    expect(seen).toEqual(['blocks/changed'])
  })

  it('sends nothing before the handshake and nothing after dispose', async () => {
    const [mainTransport, rendererTransport] = createFakePair()
    const { main, renderer } = pair
    const seen: string[] = []
    renderer.on('vault/changed', () => void seen.push('vault/changed'))
    const mainBridge = main.plugin(Bridge, { transport: mainTransport, name: 'main', forward: ['vault/changed'] })
    await mainBridge
    // The peer bridge does not exist yet.
    main.emit('vault/changed', [])
    await flush()
    expect(mainTransport.sent.map((m: any) => m.t)).toEqual(['hello'])

    await renderer.plugin(Bridge, { transport: rendererTransport, name: 'renderer', accept: ['vault/changed'] })
    await flush()
    expect(seen).toEqual([]) // the pre-connect event is not replayed
    main.emit('vault/changed', [])
    await until(() => seen.length, 'event after connect')

    await mainBridge.dispose()
    const sent = mainTransport.sent.length
    main.emit('vault/changed', [])
    await flush()
    expect(mainTransport.sent.length).toBe(sent)
    expect(seen).toEqual(['vault/changed'])
  })

  it('warns instead of throwing when a payload cannot be cloned, and keeps forwarding', async () => {
    const { main, renderer } = pair
    const logs = captureLogs(main)
    const isConnected = connected(renderer)
    const seen: unknown[] = []
    renderer.on('vault/changed', (events) => void seen.push(events))
    await main.plugin(Bridge, { transport: pair.mainTransport, forward: ['vault/changed'] })
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, accept: ['vault/changed'] })
    await until(isConnected, 'connect')

    expect(() => main.emit('vault/changed', [() => 1] as never)).not.toThrow()
    expect(logs.some((m) => m.type === 'warn' && String(m.args[0]).includes('cannot forward "vault/changed"'))).toBe(true)
    main.emit('vault/changed', [])
    await until(() => seen.length, 'later event')
    expect(seen).toEqual([[]])
  })

  it('preserves the order of events', async () => {
    const { main, renderer } = pair
    const isConnected = connected(renderer)
    const seen: string[][] = []
    renderer.on('index/updated', (paths) => void seen.push(paths))
    await main.plugin(Bridge, { transport: pair.mainTransport, forward: ['index/updated'] })
    await renderer.plugin(Bridge, { transport: pair.rendererTransport, accept: ['index/updated'] })
    await until(isConnected, 'connect')
    for (let i = 0; i < 50; i++) main.emit('index/updated', [`${i}.md`])
    await until(() => seen.length === 50, 'all events')
    expect(seen.map(([path]) => path)).toEqual(Array.from({ length: 50 }, (_, i) => `${i}.md`))
  })
})
