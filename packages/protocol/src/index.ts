export * from './vault.ts'
export * from './query.ts'
export * from './layout.ts'
export * from './blocks.ts'
export * from './live.ts'
export * from './genui.ts'
export * from './plugin.ts'

import type { GenUIEvent } from './genui.ts'
import type { HotEntry } from './live.ts'
import type { VaultEvent, VaultPath } from './vault.ts'

/**
 * Cross-process event map. Events marked [main→renderer] are forwarded by the
 * kernel IPC bridge; the kernel augments Cordis' `Events` with this map.
 */
export interface DiabaseEvents {
  /** [main→renderer] Batched, debounced file system changes. */
  'vault/changed'(events: VaultEvent[]): void
  /** [main→renderer] Index records changed for these paths (after `vault/changed`). */
  'index/updated'(paths: VaultPath[]): void
  /** [main→renderer] Initial index scan finished. */
  'index/ready'(): void
  /** [renderer] Workspace layout changed. */
  'slots/changed'(): void
  /** [renderer] Block registry contents changed. */
  'blocks/changed'(): void
  /** [renderer] A hot-loaded plugin was mounted, failed, or disposed. */
  'hot/changed'(entry: HotEntry): void
  /** [main→renderer] GenUI run progress. */
  'genui/event'(event: GenUIEvent): void
}

/** Service names on the Cordis context (`ctx.vault`, `ctx.index`, ...). */
export const SERVICE = {
  vault: 'vault',
  index: 'index',
  search: 'search',
  bundler: 'bundler',
  genui: 'genui',
  slots: 'slots',
  blocks: 'blocks',
  hot: 'hot',
} as const
