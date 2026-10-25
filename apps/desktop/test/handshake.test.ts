// @vitest-environment happy-dom
import { afterEach, describe, expect, it, vi } from 'vitest'
import { connectToMain } from '../src/renderer/handshake.ts'
import type { ConnectOptions } from '../src/renderer/handshake.ts'

type FakeWindow = NonNullable<ConnectOptions['win']> & EventTarget

function fakeWindow(): FakeWindow {
  return Object.assign(new EventTarget(), { diabase: { connect: vi.fn() } }) as unknown as FakeWindow
}

const portMessage = (win: object, overrides: { source?: unknown; data?: unknown; ports?: unknown[] } = {}) => {
  const event = new Event('message') as Event & Record<string, unknown>
  event.source = 'source' in overrides ? overrides.source : win
  event.data = 'data' in overrides ? overrides.data : { type: 'diabase:port' }
  event.ports = overrides.ports ?? []
  return event
}

afterEach(() => vi.useRealTimers())

describe('connectToMain', () => {
  it('listens first, then asks main, and resolves with the port', async () => {
    const win = fakeWindow()
    const port = {} as MessagePort
    const pending = connectToMain({ win })
    expect(win.diabase.connect).toHaveBeenCalledTimes(1)
    win.dispatchEvent(portMessage(win, { ports: [port] }))
    await expect(pending).resolves.toBe(port)
  })

  it('ignores messages from other sources, with other data, or without a port', async () => {
    const win = fakeWindow()
    const port = {} as MessagePort
    const pending = connectToMain({ win })
    win.dispatchEvent(portMessage(win, { source: {}, ports: [{}] }))
    win.dispatchEvent(portMessage(win, { data: { type: 'other' }, ports: [{}] }))
    win.dispatchEvent(portMessage(win, { data: 'diabase:port', ports: [{}] }))
    win.dispatchEvent(portMessage(win, { data: null, ports: [{}] }))
    win.dispatchEvent(portMessage(win, { ports: [] }))
    win.dispatchEvent(portMessage(win, { ports: [port] }))
    await expect(pending).resolves.toBe(port)
  })

  it('removes its listener and timer once settled', async () => {
    vi.useFakeTimers()
    const win = fakeWindow()
    const removed = vi.spyOn(win, 'removeEventListener')

    const ok = connectToMain({ win })
    win.dispatchEvent(portMessage(win, { ports: [{}] }))
    await ok
    expect(removed).toHaveBeenCalledWith('message', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)

    removed.mockClear()
    const late = connectToMain({ win, timeoutMs: 50 })
    const failure = expect(late).rejects.toThrow(/no MessagePort/)
    await vi.advanceTimersByTimeAsync(50)
    await failure
    expect(removed).toHaveBeenCalledWith('message', expect.any(Function))
    expect(vi.getTimerCount()).toBe(0)
  })

  it('rejects on abort without leaking', async () => {
    const win = fakeWindow()
    const removed = vi.spyOn(win, 'removeEventListener')
    const abort = new AbortController()
    const pending = connectToMain({ win, signal: abort.signal })
    abort.abort()
    await expect(pending).rejects.toMatchObject({ name: 'AbortError' })
    expect(removed).toHaveBeenCalledWith('message', expect.any(Function))

    await expect(connectToMain({ win, signal: abort.signal })).rejects.toMatchObject({ name: 'AbortError' })
  })
})
