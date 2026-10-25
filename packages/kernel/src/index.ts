// The only module in Diabase that imports `cordis` directly. Every plugin imports
// the kernel from here, so swapping to a vendored Cordis copy is a one-file change.
// Pinned to cordis@4.0.0-rc.12 (see docs/architecture.md §2).
import type {
  BlockRegistryService,
  BundlerService,
  DiabaseEvents,
  GenUIService,
  HotService,
  IndexService,
  RuntimeSlotsService,
  SearchService,
  VaultService,
} from '@diabase/protocol'
import type { PluginLoaderService } from './loader-types.ts'

export * from 'cordis'
export { Context as default } from 'cordis'
export type * from './loader-types.ts'

/** Kernel-owned events, merged into Cordis `Events` next to `DiabaseEvents`. */
export interface KernelEvents {
  /**
   * The plugin loader finished a reconcile that changed something (states, loaded code, config
   * error). Live Cordis state changes outside a reconcile, such as a pending plugin becoming
   * active later, do not emit it; `ctx.loader.list()` always reflects them.
   */
  'loader/changed'(): void
}

declare module 'cordis' {
  // Services are only present on a context that injected them (Cordis throws otherwise).
  // In the renderer, main-process services are `Remote<T>` proxies; their methods are
  // already async, so the same interface types both sides.
  interface Context {
    vault: VaultService
    index: IndexService
    search: SearchService
    bundler: BundlerService
    genui: GenUIService
    slots: RuntimeSlotsService
    blocks: BlockRegistryService
    hot: HotService
    loader: PluginLoaderService
  }

  interface Events extends DiabaseEvents, KernelEvents {}
}
