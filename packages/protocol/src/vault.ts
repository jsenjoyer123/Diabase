// Vault service contract. Implemented in the Electron main process by
// @diabase/plugin-vault and proxied into the renderer by the kernel IPC bridge,
// so every argument and return value must be structured-clone safe.

/** POSIX-style path relative to the vault root, no leading slash: `Books/Dune.md`. */
export type VaultPath = string

/** Content hash used for optimistic concurrency (contract inherited from Noteriv). */
export type ContentHash = `sha256-${string}`

export interface VaultInfo {
  /** Stable id derived from the absolute root; the renderer never sees the absolute path. */
  id: string
  name: string
}

export interface FileEntry {
  path: VaultPath
  name: string
  kind: 'file' | 'dir'
  size?: number
  mtimeMs?: number
  ctimeMs?: number
}

export interface FileContent {
  path: VaultPath
  content: string
  hash: ContentHash
  mtimeMs: number
}

export interface WriteOptions {
  /**
   * Optimistic concurrency guard.
   * - `undefined`: unconditional write.
   * - `null`: the file must not exist yet (create).
   * - hash: the file's current content must hash to this value.
   */
  baseHash?: ContentHash | null
}

export type WriteResult =
  | { ok: true; hash: ContentHash }
  | { ok: false; reason: 'conflict'; currentHash: ContentHash | null }

/** One structural edit to YAML frontmatter. Untouched keys, order and comments are preserved. */
export type FrontmatterOp =
  | { op: 'set'; key: string | Array<string | number>; value: unknown }
  | { op: 'delete'; key: string | Array<string | number> }

export interface Note {
  path: VaultPath
  /** Parsed YAML frontmatter; `{}` when absent. */
  frontmatter: Record<string, unknown>
  /** Markdown after the frontmatter block. */
  body: string
  hash: ContentHash
  mtimeMs: number
}

export type VaultEventOrigin = 'self' | 'external'

export type VaultEvent =
  | { type: 'add'; path: VaultPath; kind: 'file' | 'dir'; origin: VaultEventOrigin }
  | { type: 'change'; path: VaultPath; hash: ContentHash; origin: VaultEventOrigin }
  | { type: 'unlink'; path: VaultPath; kind: 'file' | 'dir'; origin: VaultEventOrigin }
  | { type: 'rename'; from: VaultPath; to: VaultPath; origin: VaultEventOrigin }

export interface ListOptions {
  recursive?: boolean
  /** Include dot-entries such as `.diabase/`. Default false. */
  includeHidden?: boolean
  /** Only files whose name ends with one of these extensions, e.g. `['.md']`. */
  extensions?: string[]
}

export interface VaultService {
  info(): Promise<VaultInfo>
  list(dir?: VaultPath, options?: ListOptions): Promise<FileEntry[]>
  exists(path: VaultPath): Promise<boolean>
  stat(path: VaultPath): Promise<FileEntry | null>
  /** Throws `VaultError` with code `ENOENT` when missing. */
  read(path: VaultPath): Promise<FileContent>
  readBinary(path: VaultPath): Promise<Uint8Array>
  /** Atomic (tmp + rename) and guarded by `options.baseHash`. Creates parent dirs. */
  write(path: VaultPath, content: string, options?: WriteOptions): Promise<WriteResult>
  writeBinary(path: VaultPath, data: Uint8Array, options?: WriteOptions): Promise<WriteResult>
  mkdir(path: VaultPath): Promise<void>
  /** Fails if `to` exists. */
  rename(from: VaultPath, to: VaultPath): Promise<void>
  /** Moves to `.diabase/trash/` by default; `permanent: true` deletes. */
  delete(path: VaultPath, options?: { permanent?: boolean }): Promise<void>

  readNote(path: VaultPath): Promise<Note>
  /** Round-trip-safe frontmatter edit. Creates the frontmatter block if absent. */
  updateFrontmatter(path: VaultPath, ops: FrontmatterOp[], options?: WriteOptions): Promise<WriteResult>
}

export type VaultErrorCode =
  | 'ENOENT'
  | 'EEXIST'
  | 'EOUTSIDE'
  | 'EINVALIDPATH'
  | 'EISDIR'
  | 'ENOTDIR'
  /** `updateFrontmatter` on a note whose existing frontmatter is not a valid YAML mapping (left untouched). */
  | 'EPARSE'

export interface VaultErrorShape {
  name: 'VaultError'
  code: VaultErrorCode
  path: VaultPath
  message: string
}
