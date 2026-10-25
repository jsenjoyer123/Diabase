import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import type { Context, Plugin } from '@diabase/kernel'
import { boot, shutdown } from '../src/main/boot.ts'

beforeEach(() => void vi.spyOn(console, 'log').mockImplementation(() => {}))
afterEach(() => shutdown())

describe('main boot/shutdown', () => {
  it('boots one root context per process', async () => {
    const { root, vaultRoot } = await boot('/vault')
    expect(vaultRoot).toBe('/vault')
    expect(root.registry.size).toBe(0)
    await expect(boot('/other')).rejects.toThrow(/already booted/)
  })

  it('shutdown disposes top-level fibers newest first, and their nested fibers', async () => {
    const { root } = await boot('/vault')
    const log: string[] = []
    const plugin = (name: string, nested?: Plugin): Plugin => ({
      name,
      apply(ctx: Context) {
        if (nested) ctx.plugin(nested)
        ctx.effect(() => async () => {
          await new Promise((resolve) => setTimeout(resolve, 5))
          log.push(name)
        })
      },
    })
    await root.plugin(plugin('first', plugin('first-child')))
    await root.plugin(plugin('second'))

    await shutdown()
    expect(log).toHaveLength(3)
    expect(log.indexOf('second')).toBeLessThan(log.indexOf('first'))
    expect(log).toContain('first-child')
  })

  it('shutdown is idempotent and allows booting again', async () => {
    await boot('/a')
    await shutdown()
    await shutdown()
    expect((await boot('/b')).vaultRoot).toBe('/b')
  })
})
