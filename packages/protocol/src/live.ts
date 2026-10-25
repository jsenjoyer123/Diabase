// Live bundler (main) and hot-swap loader (renderer) contracts.
import type { VaultPath } from './vault.ts'

export interface Diagnostic {
  text: string
  file?: string
  line?: number
  column?: number
  lineText?: string
}

export type BuildInput =
  /** A directory in the vault (e.g. `.diabase/blocks/user/book-shelf`) and its entry file. */
  | { dir: VaultPath; entry?: string }
  /** In-memory sources, for agent drafts that have not been written yet. Keys are relative paths. */
  | { files: Record<string, string>; entry: string }

export type BuildResult =
  | { ok: true; code: string; css?: string; hash: string; warnings: Diagnostic[] }
  | { ok: false; errors: Diagnostic[]; warnings: Diagnostic[] }

export interface BundlerService {
  /** ESM output; bare imports outside `sharedModules()` are build errors. */
  build(input: BuildInput): Promise<BuildResult>
  /** Bare specifiers the renderer host provides to runtime bundles (react, @diabase/sdk, ...). */
  sharedModules(): string[]
}

export type HotState = 'mounted' | 'failed' | 'disposed'

export interface HotEntry {
  /** Plugin id: for vault blocks, the block type (`user/book-shelf`). */
  id: string
  dir: VaultPath
  hash: string | null
  state: HotState
  errors?: Diagnostic[]
  /** Hash of the last bundle that mounted successfully (rollback target). */
  lastGoodHash?: string | null
}

export type HotResult = { ok: true; entry: HotEntry } | { ok: false; entry: HotEntry; errors: Diagnostic[] }

/** Renderer-local service (`ctx.hot`), bridged to main as async for the GenUI agent. */
export interface HotService {
  /** Build `dir`, dispose the previous instance of `id`, mount the new bundle. Never throws for build/runtime errors. */
  install(id: string, input: BuildInput & { dir?: VaultPath }): Promise<HotResult>
  uninstall(id: string): Promise<void>
  rollback(id: string): Promise<HotResult>
  list(): HotEntry[]
}
