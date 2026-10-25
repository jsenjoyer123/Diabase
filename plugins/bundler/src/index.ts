// `ctx.bundler`: compiles runtime-authored block plugins into the factory-wrapped classic script
// described in README.md. Main-process service; injects `vault` to snapshot block directories.
import * as esbuild from 'esbuild'
import { Context, Service } from '@diabase/kernel'
import { SHARED_MODULES, type BuildInput, type BuildResult, type BundlerService } from '@diabase/protocol'
import { Builder, type BuilderStats } from './builder.ts'
import { BundlerConfigSchema, type BundlerConfig, type BundlerConfigInput } from './config.ts'

export { BUNDLE_FORMAT, BUNDLE_TARGET, BundlerConfigSchema } from './config.ts'
export type { BundlerConfig, BundlerConfigInput } from './config.ts'
export type { BuilderStats } from './builder.ts'

/**
 * Bundler instances alive in this process. The esbuild child process is shared by all of them, so
 * it is stopped only when the last one goes away (esbuild restarts it lazily on the next use).
 */
let liveInstances = 0

export class Bundler extends Service implements BundlerService {
  static inject = ['vault']
  static Config = BundlerConfigSchema

  /** Counters for tests; not part of `BundlerService`. */
  readonly stats: BuilderStats
  // Methods run with a Cordis proxy as `this` (the caller's context view), which rejects `#private`
  // fields: keep state in one plain object.
  private readonly core: Builder

  constructor(ctx: Context, config?: BundlerConfigInput) {
    super(ctx, 'bundler')
    const resolved: BundlerConfig = BundlerConfigSchema.parse(config)
    this.core = new Builder(resolved, {
      vault: () => ctx.vault,
      onInternalError: (error) => ctx.logger.error(error),
    })
    this.stats = this.core.stats
    // One disposer for the whole teardown: Cordis runs async disposers concurrently.
    ctx.effect(() => async () => {
      await this.core.dispose()
      if (--liveInstances === 0) await esbuild.stop()
    })
    liveInstances++
  }

  sharedModules(): string[] {
    return [...SHARED_MODULES]
  }

  build(input: BuildInput): Promise<BuildResult> {
    return this.core.build(input)
  }
}

export default Bundler
