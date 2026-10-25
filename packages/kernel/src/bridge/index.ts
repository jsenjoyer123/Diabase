import type { Context } from '../index.ts'
import { BridgeConfigSchema } from './config.ts'
import type { BridgeConfig } from './config.ts'
import { BridgeLink } from './link.ts'

export * from './config.ts'
export * from './errors.ts'
export * from './transport.ts'
export { PROTOCOL_VERSION } from './wire.ts'

/**
 * Cordis-native RPC between two contexts (typically Electron main and the renderer).
 * `ctx.plugin(Bridge, config)` on both ends of one transport; see `BridgeConfig`.
 *
 * Lifecycle across the bridge mirrors Cordis: a proxy is provided only while connected AND the
 * origin service exists; when the origin leaves, the importing side's dependents are disposed
 * first (and may still call the service from their disposers) before the origin finishes
 * unloading.
 */
export const Bridge = {
  name: 'bridge',
  Config: BridgeConfigSchema,
  apply(ctx: Context, config: BridgeConfig) {
    const link = new BridgeLink(ctx, config)
    link.attach()
    // Last, so its disposer is invoked first and flips the bridge to "closed" before the
    // per-service fibers (which Cordis unloads concurrently) get to their own disposers.
    ctx.effect(() => link.start(), 'bridge')
  },
}
