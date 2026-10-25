// Plain-data types of the plugin loader service. Node-free so the renderer can import them;
// the implementation lives in `./main/` (see `@diabase/kernel/main`). Everything here is
// structured-clone safe because it crosses the IPC bridge.
import type { PluginManifest, VaultPath } from '@diabase/protocol'

/**
 * - `disabled`: installed, but not enabled in `.diabase/config.yml`.
 * - `loading`:  being imported or applied.
 * - `active`:   applied (also: enabled plugins that have no `main` entry, nothing runs in main).
 * - `pending`:  imported, but the Cordis fiber waits for missing injects. See the inspector.
 * - `failed`:   import or apply threw (`error` has the message).
 * - `invalid`:  manifest or entry paths are unusable (`error` has the reason).
 */
export type PluginLoadState = 'disabled' | 'loading' | 'active' | 'pending' | 'failed' | 'invalid'

export interface PluginStatus {
  /** Manifest id, or the directory name when the manifest is invalid. */
  id: string
  /** `.diabase/plugins/<dirname>` */
  dir: VaultPath
  manifest: PluginManifest | null
  enabled: boolean
  state: PluginLoadState
  error?: string
  /** Vault path of the main entry (validated), when the manifest declares one. */
  main?: VaultPath
  /** Vault path of the renderer entry (validated), when the manifest declares one. */
  renderer?: VaultPath
}

export interface RendererEntry {
  id: string
  dir: VaultPath
  entry: VaultPath
}

export interface PluginLoaderService {
  /** Live snapshot: states follow the Cordis fibers, so `pending` can turn `active` without a rescan. */
  list(): PluginStatus[]
  /** Enabled plugins with a `renderer` entry: input for the phase-2 renderer hot loader. */
  renderers(): RendererEntry[]
  /**
   * Re-scan now. With an id, also force a fresh import of that plugin's main entry.
   * Resolves when the reconcile is done, so never await it from inside a plugin's `apply`.
   */
  reload(id?: string): Promise<void>
  /** Last `config.yml` read/parse/validation error, or null. */
  configError(): string | null
}

export interface PluginLoaderConfig {
  /**
   * Absolute vault root, the same path the vault plugin was given. Used ONLY to build file
   * URLs for `import()`; all reads go through `ctx.vault`.
   */
  root: string
  /** Debounce for `vault/changed`-triggered rescans, ms (default 150). */
  debounce?: number
}
