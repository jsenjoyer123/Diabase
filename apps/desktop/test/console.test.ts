import { Context } from '@diabase/kernel'
import { describe, expect, it } from 'vitest'
import { plugConsole } from '../src/renderer/console/plugins.ts'
import { createConsoleStores, EXPECTED_SERVICES } from '../src/renderer/console/state.ts'
import { createStore } from '../src/renderer/store.ts'

describe('createStore', () => {
  it('notifies on change, skips identical snapshots, unsubscribes', () => {
    const store = createStore({ n: 0 })
    let calls = 0
    const off = store.subscribe(() => calls++)
    store.set({ n: 1 })
    store.set((s) => ({ n: s.n + 1 }))
    const same = store.get()
    store.set(same)
    expect(store.get()).toEqual({ n: 2 })
    expect(calls).toBe(2)
    off()
    store.set({ n: 3 })
    expect(calls).toBe(2)
  })
})

describe('console plugins (stage 1, no bridge)', () => {
  it('starts every section in its waiting state', () => {
    const stores = createConsoleStores()
    expect(stores.bridge.get()).toMatchObject({ phase: 'connecting', portReceived: false, remoteServices: [] })
    expect(stores.services.get().entries.map((e) => e.name)).toEqual([...EXPECTED_SERVICES])
    expect(stores.services.get().entries.every((e) => e.status === 'waiting')).toBe(true)
    expect(stores.inspector.get().status).toBe('waiting')
    expect(stores.files.get()).toEqual({ status: 'waiting', files: [] })
    expect(stores.events.get().entries).toEqual([])
  })

  it('logs forwarded events on the renderer context and stops after dispose', async () => {
    const root = new Context()
    const stores = createConsoleStores()
    const fiber = root.plugin((ctx: Context) => plugConsole(ctx, stores))
    await fiber

    root.emit('vault/changed', [
      { type: 'change', path: 'a.md', hash: 'sha256-abc', origin: 'external' },
      { type: 'rename', from: 'b.md', to: 'c.md', origin: 'self' },
    ])
    root.emit('index/updated', ['a.md'])
    root.emit('index/ready')
    expect(stores.events.get().entries.map(({ event, detail }) => [event, detail])).toEqual([
      ['vault/changed', 'change a.md, rename b.md -> c.md'],
      ['index/updated', 'a.md'],
      ['index/ready', ''],
    ])

    await fiber.dispose()
    root.emit('index/ready')
    expect(stores.events.get().entries).toHaveLength(3)
  })
})
