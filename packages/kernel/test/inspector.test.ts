import { describe, expect, it } from 'vitest'
import { Context, Inspector, type InspectorFiber } from '@diabase/kernel'

function findFiber(root: InspectorFiber, uid: number): InspectorFiber | undefined {
  if (root.uid === uid) return root
  for (const child of root.children) {
    const found = findFiber(child, uid)
    if (found) return found
  }
}

const flush = () => new Promise((resolve) => setTimeout(resolve, 0))

describe('kernel inspector', () => {
  it('reports missing required injects through provider up/down and disposed lifecycle', async () => {
    const root = new Context()
    await root.plugin(Inspector)

    const consumer = root.plugin({
      name: 'consumer',
      inject: ['catalog'],
      apply(ctx: Context) {
        ctx.on('vault/changed', () => {})
      },
    })
    const consumerUid = consumer.uid!
    await flush()

    let snapshot = root.inspector.snapshot()
    let fiber = findFiber(snapshot.root, consumerUid)
    expect(fiber?.state).toBe('pending')
    expect(fiber?.injects).toEqual([{ name: 'catalog', available: false }])
    expect(fiber?.missingInjects).toEqual(['catalog'])

    const provider = root.plugin({
      name: 'catalog-provider',
      apply(ctx: Context) {
        ctx.provide('catalog', { ready: true })
      },
    })
    await provider
    await flush()

    snapshot = root.inspector.snapshot()
    fiber = findFiber(snapshot.root, consumerUid)
    expect(fiber?.state).toBe('active')
    expect(fiber?.missingInjects).toEqual([])
    expect(snapshot.services).toContainEqual({
      name: 'catalog',
      provider: { uid: provider.uid, name: 'catalog-provider' },
    })
    expect(snapshot.events).toContainEqual({
      name: 'vault/changed',
      listeners: 1,
      fibers: [consumerUid],
    })

    await provider.dispose()
    await flush()

    snapshot = root.inspector.snapshot()
    fiber = findFiber(snapshot.root, consumerUid)
    expect(fiber?.state).toBe('pending')
    expect(fiber?.missingInjects).toEqual(['catalog'])
    expect(snapshot.services.some(({ name }) => name === 'catalog')).toBe(false)
    expect(snapshot.events.some(({ name }) => name === 'vault/changed')).toBe(false)

    await consumer.dispose()
    snapshot = root.inspector.snapshot()
    expect(findFiber(snapshot.root, consumerUid)?.state).toBe('disposed')
  })

  it('returns a structured-clone-safe fiber tree with states, services, and events', async () => {
    const root = new Context()
    await root.plugin(Inspector)
    const plugin = root.plugin({
      name: 'observed-plugin',
      apply(ctx: Context) {
        ctx.provide('observed-service', { value: 1 })
        ctx.on('index/ready', () => {})
      },
    })
    await plugin

    const snapshot = root.inspector.snapshot()
    expect(() => structuredClone(snapshot)).not.toThrow()
    const observed = findFiber(snapshot.root, plugin.uid!)
    expect(observed?.state).toBe('active')
    expect(observed?.services).toContain('observed-service')
    expect(snapshot.services.map(({ name }) => name)).toContain('observed-service')
    expect(snapshot.events).toContainEqual({
      name: 'index/ready',
      listeners: 1,
      fibers: [plugin.uid],
    })
  })
})
