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

export * from 'cordis'
export { Context as default } from 'cordis'

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
  }

  interface Events extends DiabaseEvents {}
}
