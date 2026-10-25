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
  /**
   * CommonJS factory bundle (format: `plugins/bundler/README.md`); bare imports outside
   * `sharedModules()` are build errors. Never rejects for errors in the sources.
   */
  build(input: BuildInput): Promise<BuildResult>
  /** Bare specifiers the renderer host provides to runtime bundles (react, @diabase/sdk, ...). */
  sharedModules(): string[]
}

/**
 * Bare specifiers the renderer host provides to runtime bundles through its frozen module
 * table. Every other bare import (npm packages, Node built-ins, `cordis`) is a build error;
 * blocks reach Cordis, the UI kit and services only through `@diabase/sdk`.
 */
export const SHARED_MODULES = Object.freeze([
  'react',
  'react/jsx-runtime',
  'react-dom',
  'react-dom/client',
  'zod',
  '@diabase/protocol',
  '@diabase/sdk',
] as const)
export type SharedModule = (typeof SHARED_MODULES)[number]

/** Global the renderer host installs before evaluating a bundle. */
export const BUNDLE_GLOBAL = '__diabase_modules__'

/** CommonJS module body produced by the bundler; `require` answers only `SHARED_MODULES`. */
export type BundleFactory = (
  require: (specifier: string) => unknown,
  module: { exports: Record<string, unknown> },
  exports: Record<string, unknown>,
) => void

/** Argument of `__diabase_modules__.load(...)`, the first statement every bundle executes. */
export interface BundleRegistration {
  /** Source identity: the vault dir for dir builds, `draft:<entry>` for drafts. Informational. */
  id: string
  /** `BuildResult.hash` of the build that produced this bundle; the host matches on it. */
  hash: string
  factory: BundleFactory
}

/** Shape of `globalThis.__diabase_modules__` in the renderer. */
export interface BundleModuleHost {
  load(registration: BundleRegistration): void
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
