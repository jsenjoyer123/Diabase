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

  it('returns a clone-safe tree with nested fibers, services, and event effects', async () => {
    const root = new Context()
    await root.plugin(Inspector)
    let nestedUid: number | null = null
    const parent = root.plugin({
      name: 'observed-parent',
      apply(ctx: Context) {
        ctx.provide('observed-service', { value: 1 })
        ctx.on('index/ready', () => {})
        nestedUid = ctx.plugin({
          name: 'nested-observer',
          apply(childCtx: Context) {
            childCtx.provide('nested-service', { value: 2 })
            childCtx.on('vault/changed', () => {})
          },
        }).uid
      },
    })
    await parent
    await flush()

    const snapshot = root.inspector.snapshot()
    const parentFiber = findFiber(snapshot.root, parent.uid!)
    const nestedFiber = findFiber(snapshot.root, nestedUid!)
    expect(snapshot.root.uid).toBe(0)
    expect(parent.uid).toBeGreaterThan(snapshot.root.uid)
    expect(nestedUid).not.toBe(parent.uid)
    expect(() => structuredClone(snapshot)).not.toThrow()
    expect(parentFiber?.state).toBe('active')
    expect(parentFiber?.services).toContain('observed-service')
    expect(parentFiber?.children).toContainEqual(expect.objectContaining({ uid: nestedUid }))
    expect(nestedFiber?.state).toBe('active')
    expect(nestedFiber?.services).toContain('nested-service')
    expect(snapshot.services.map(({ name }) => name)).toEqual(expect.arrayContaining(['observed-service', 'nested-service']))
    expect(snapshot.events).toContainEqual({
      name: 'index/ready',
      listeners: 1,
      fibers: [parent.uid],
    })
    expect(snapshot.events).toContainEqual({
      name: 'vault/changed',
      listeners: 1,
      fibers: [nestedUid],
    })
  })
})
