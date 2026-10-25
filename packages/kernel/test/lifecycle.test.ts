// Pins the Cordis semantics every Diabase plugin relies on. If a Cordis upgrade
// breaks one of these, the whole plugin model is affected — fix here first.
import { describe, expect, it } from 'vitest'
import { Context, Service } from '@diabase/kernel'

class FakeVault extends Service {
  constructor(ctx: Context) {
    super(ctx, 'vault')
  }
  info = async () => ({ id: 'v', name: 'fake' })
}

describe('cordis lifecycle contract', () => {
  it('disposes a dependent when its service leaves and re-applies it when the service returns', async () => {
    const root = new Context()
    const log: string[] = []
    const consumer = root.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(ctx: Context) {
        log.push('apply')
        ctx.on('vault/changed', (events) => log.push(`event:${events.length}`))
        ctx.effect(() => () => log.push('dispose'))
      },
    })
    const provider = root.plugin(FakeVault)
    await provider
    await consumer
    root.emit('vault/changed', [])
    await provider.dispose()
    root.emit('vault/changed', [])
    expect(log).toEqual(['apply', 'event:0', 'dispose'])
    await root.plugin(FakeVault)
    await new Promise((r) => setTimeout(r, 0))
    expect(log).toEqual(['apply', 'event:0', 'dispose', 'apply'])
  })

  it('hot-swaps a plugin implementation via registry.delete + re-plugin', async () => {
    const root = new Context()
    const log: string[] = []
    const v1 = { name: 'block', apply: (ctx: Context) => ctx.effect(() => () => log.push('v1:off')) }
    const v2 = { name: 'block', apply: (ctx: Context) => { log.push('v2:on') } }
    await root.plugin(v1)
    await root.registry.delete(v1)
    await root.plugin(v2)
    expect(log).toEqual(['v1:off', 'v2:on'])
  })
})
