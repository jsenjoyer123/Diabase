// In-memory `VaultService` for tests (`@diabase/plugin-vault/testing`).
//
//   const ctx = new Context()
//   await ctx.plugin(createMemoryVault({ 'Books/Dune.md': '# Dune' }))
//   await ctx.vault.read('Books/Dune.md')
//
// It follows the same contract as the fs-backed vault: guarded writes
// (`baseHash`), `VaultError` codes, trash-on-delete, round-trip-safe
// frontmatter edits, and a `vault/changed` event for every mutation.
//
// Test helpers: the service instance carries an `external` handle that mutates
// the store *as if another process had* (origin `'external'`, no guards).
// Reach it with a cast, or with `getMemoryVault(ctx)`:
//
//   getMemoryVault(ctx).external.write('a.md', 'edited elsewhere')
//
// Notes on fidelity:
// - Every mutating call emits exactly one `vault/changed` batch holding one
//   event. Implicitly created parent folders do not get their own `add` events.
// - Folders persist after their last file is removed (like a real file system).
import { Service, type Context } from '@diabase/kernel'
import type {
  FileContent,
  FileEntry,
  FrontmatterOp,
  ListOptions,
  Note,
  VaultEvent,
  VaultEventOrigin,
  VaultInfo,
  VaultPath,
  VaultService,
  WriteOptions,
  WriteResult,
} from '@diabase/protocol'
import { isMap, parseDocument } from 'yaml'
import { VaultError } from './errors.ts'
import { hashContent } from './hash.ts'
import { assertPortablePath, baseName, isWithin, normalizeVaultPath, parentPath } from './paths.ts'

const TRASH_ROOT = '.diabase/trash'
const encoder = new TextEncoder()
const decoder = new TextDecoder()

type Data = string | Uint8Array

const toText = (data: Data): string => (typeof data === 'string' ? data : decoder.decode(data))
const toBytes = (data: Data): Uint8Array => (typeof data === 'string' ? encoder.encode(data) : data.slice())
const byteLength = (data: Data): number => (typeof data === 'string' ? encoder.encode(data).length : data.length)

/** Mutations as seen by the vault when *another process* touches the files. No guards, origin `'external'`. */
export interface MemoryVaultExternal {
  /** Create or overwrite a file (emits `add` or `change`). */
  write(path: VaultPath, content: string | Uint8Array): void
  /** Permanently remove a file or folder (emits `unlink`); no trash. */
  delete(path: VaultPath): void
  /** Move a file or folder, overwriting `to` if it exists (emits `rename`). */
  rename(from: VaultPath, to: VaultPath): void
}

export class MemoryVault extends Service implements VaultService {
  /** Backing store, exposed for assertions (e.g. `vault.files.has('.diabase/trash/a.md')`). */
  readonly files = new Map<VaultPath, Data>()
  readonly external: MemoryVaultExternal

  private readonly dirs = new Set<VaultPath>()
  private readonly times = new Map<VaultPath, { mtimeMs: number; ctimeMs: number }>()
  private clock = 0

  constructor(ctx: Context, seed: Record<string, string> = {}) {
    super(ctx, 'vault')
    for (const [path, content] of Object.entries(seed)) {
      const p = normalizeVaultPath(path)
      if (p === '') throw new VaultError('EISDIR', path)
      this.assertAncestorsAreDirs(p)
      this.putFile(p, content)
    }
    this.external = {
      write: (path, content) => {
        const p = this.filePath(path)
        this.assertAncestorsAreDirs(p)
        this.emit(this.store(p, content, 'external'))
      },
      delete: (path) => {
        const p = this.nonRoot(path)
        const kind = this.kindOf(p)
        if (kind === null) throw new VaultError('ENOENT', p)
        this.remove(p)
        this.emit({ type: 'unlink', path: p, kind, origin: 'external' })
      },
      rename: (from, to) => {
        const src = this.nonRoot(from)
        const dst = this.nonRoot(to)
        if (this.kindOf(src) === null) throw new VaultError('ENOENT', src)
        if (isWithin(dst, src)) throw new VaultError('EINVALIDPATH', dst, 'Cannot move a folder into itself')
        this.assertAncestorsAreDirs(dst)
        if (this.kindOf(dst) !== null) this.remove(dst)
        this.move(src, dst)
        this.emit({ type: 'rename', from: src, to: dst, origin: 'external' })
      },
    }
  }

  // -- reads ---------------------------------------------------------------

  async info(): Promise<VaultInfo> {
    return { id: 'memory-vault', name: 'Memory vault' }
  }

  async list(dir: VaultPath = '', options: ListOptions = {}): Promise<FileEntry[]> {
    const d = normalizeVaultPath(dir)
    if (this.files.has(d)) throw new VaultError('ENOTDIR', d)
    if (!this.isDir(d)) throw new VaultError('ENOENT', d)
    const prefix = d === '' ? '' : `${d}/`
    const extensions = options.extensions?.map((e) => e.toLowerCase())
    const out: FileEntry[] = []
    const consider = (path: VaultPath, kind: 'file' | 'dir'): void => {
      if (path === d || !path.startsWith(prefix)) return
      const rel = path.slice(prefix.length)
      if (!options.recursive && rel.includes('/')) return
      if (!options.includeHidden && rel.split('/').some((segment) => segment.startsWith('.'))) return
      if (kind === 'file' && extensions && !extensions.some((e) => path.toLowerCase().endsWith(e))) return
      out.push(this.entry(path))
    }
    for (const path of this.files.keys()) consider(path, 'file')
    for (const path of this.dirs) consider(path, 'dir')
    return out.sort((a, b) => (a.path < b.path ? -1 : a.path > b.path ? 1 : 0))
  }

  async exists(path: VaultPath): Promise<boolean> {
    return this.kindOf(normalizeVaultPath(path)) !== null
  }

  async stat(path: VaultPath): Promise<FileEntry | null> {
    const p = normalizeVaultPath(path)
    return this.kindOf(p) === null ? null : this.entry(p)
  }

  async read(path: VaultPath): Promise<FileContent> {
    const p = this.existingFile(path)
    const data = this.files.get(p) as Data
    return { path: p, content: toText(data), hash: hashContent(data), mtimeMs: this.times.get(p)?.mtimeMs ?? 0 }
  }

  async readBinary(path: VaultPath): Promise<Uint8Array> {
    return toBytes(this.files.get(this.existingFile(path)) as Data)
  }

  async readNote(path: VaultPath): Promise<Note> {
    const file = await this.read(path)
    const { yaml, body } = splitFrontmatter(file.content)
    let frontmatter: Record<string, unknown> = {}
    if (yaml !== null) {
      const doc = parseDocument(yaml)
      const value: unknown = doc.errors.length === 0 && isMap(doc.contents) ? doc.toJS() : null
      if (typeof value === 'object' && value !== null && !Array.isArray(value)) {
        frontmatter = value as Record<string, unknown>
      }
    }
    return { path: file.path, frontmatter, body, hash: file.hash, mtimeMs: file.mtimeMs }
  }

  // -- writes --------------------------------------------------------------

  async write(path: VaultPath, content: string, options?: WriteOptions): Promise<WriteResult> {
    return this.guardedWrite(this.filePath(path), content, options)
  }

  async writeBinary(path: VaultPath, data: Uint8Array, options?: WriteOptions): Promise<WriteResult> {
    return this.guardedWrite(this.filePath(path), data, options)
  }

  async mkdir(path: VaultPath): Promise<void> {
    const p = normalizeVaultPath(path)
    if (p === '' || this.isDir(p)) return
    if (this.files.has(p)) throw new VaultError('EEXIST', p)
    this.assertAncestorsAreDirs(p)
    assertPortablePath(p)
    this.ensureDirs(p)
    this.emit({ type: 'add', path: p, kind: 'dir', origin: 'self' })
  }

  async rename(from: VaultPath, to: VaultPath): Promise<void> {
    const src = this.nonRoot(from)
    const dst = this.nonRoot(to)
    const kind = this.kindOf(src)
    if (kind === null) throw new VaultError('ENOENT', src)
    if (this.kindOf(dst) !== null) throw new VaultError('EEXIST', dst)
    if (isWithin(dst, src)) throw new VaultError('EINVALIDPATH', dst, 'Cannot move a folder into itself')
    this.assertAncestorsAreDirs(dst)
    assertPortablePath(dst)
    this.move(src, dst)
    this.emit({ type: 'rename', from: src, to: dst, origin: 'self' })
  }

  async delete(path: VaultPath, options: { permanent?: boolean } = {}): Promise<void> {
    const p = this.nonRoot(path)
    const kind = this.kindOf(p)
    if (kind === null) throw new VaultError('ENOENT', p)
    // Anything already in the trash (or containing it) is removed for good.
    if (options.permanent || isWithin(p, TRASH_ROOT) || isWithin(TRASH_ROOT, p)) this.remove(p)
    else this.move(p, this.freeTrashPath(p))
    this.emit({ type: 'unlink', path: p, kind, origin: 'self' })
  }

  async updateFrontmatter(path: VaultPath, ops: FrontmatterOp[], options?: WriteOptions): Promise<WriteResult> {
    const p = this.filePath(path)
    const existing = this.files.get(p)
    if (existing === undefined && options?.baseHash !== null) throw new VaultError('ENOENT', p)
    const currentHash = existing === undefined ? null : hashContent(existing)
    if (options?.baseHash !== undefined && options.baseHash !== currentHash) {
      return { ok: false, reason: 'conflict', currentHash }
    }
    this.assertAncestorsAreDirs(p)

    const text = existing === undefined ? '' : toText(existing)
    const { yaml, body } = splitFrontmatter(text)
    const doc = parseDocument(yaml ?? '')
    if (doc.errors.length > 0 || (doc.contents !== null && !isMap(doc.contents))) {
      throw new VaultError('EPARSE', p, 'Frontmatter is not a valid YAML mapping')
    }
    try {
      for (const op of ops) {
        const keyPath = typeof op.key === 'string' ? [op.key] : op.key
        if (op.op === 'delete' || op.value === undefined) {
          if (doc.contents !== null) doc.deleteIn(keyPath)
        } else doc.setIn(keyPath, op.value)
      }
    } catch (error) {
      throw new VaultError('EPARSE', p, error instanceof Error ? error.message : String(error))
    }

    let out: string
    if (doc.contents === null) out = yaml ?? ''
    else if (isMap(doc.contents) && doc.contents.items.length === 0) out = ''
    else out = String(doc)
    if (out !== '' && !out.endsWith('\n')) out += '\n'
    const next = yaml === null && out === '' ? text : `---\n${out}---\n${body}`
    if (existing !== undefined && next === text) return { ok: true, hash: hashContent(existing) }
    return this.guardedWrite(p, next, undefined)
  }

  // -- internals -----------------------------------------------------------

  private emit(event: VaultEvent): void {
    this.ctx.emit('vault/changed', [event])
  }

  private tick(): number {
    this.clock = Math.max(Date.now(), this.clock + 1)
    return this.clock
  }

  private isDir(path: VaultPath): boolean {
    return path === '' || this.dirs.has(path)
  }

  private kindOf(path: VaultPath): 'file' | 'dir' | null {
    if (this.files.has(path)) return 'file'
    return this.isDir(path) ? 'dir' : null
  }

  private nonRoot(path: VaultPath): VaultPath {
    const p = normalizeVaultPath(path)
    if (p === '') throw new VaultError('EINVALIDPATH', path, 'The vault root cannot be the target of this operation')
    return p
  }

  /** Normalized path that is allowed to hold a file (not the root, not an existing folder). */
  private filePath(path: VaultPath): VaultPath {
    const p = normalizeVaultPath(path)
    if (p === '' || this.isDir(p)) throw new VaultError('EISDIR', p)
    return p
  }

  private existingFile(path: VaultPath): VaultPath {
    const p = normalizeVaultPath(path)
    if (this.files.has(p)) return p
    throw this.isDir(p) ? new VaultError('EISDIR', p) : new VaultError('ENOENT', p)
  }

  private assertAncestorsAreDirs(path: VaultPath): void {
    const segments = path.split('/')
    for (let i = 1; i < segments.length; i++) {
      if (this.files.has(segments.slice(0, i).join('/'))) throw new VaultError('ENOTDIR', path)
    }
  }

  private ensureDirs(dir: VaultPath): void {
    if (dir === '') return
    const segments = dir.split('/')
    for (let i = 1; i <= segments.length; i++) {
      const sub = segments.slice(0, i).join('/')
      if (this.dirs.has(sub)) continue
      this.dirs.add(sub)
      const now = this.tick()
      this.times.set(sub, { mtimeMs: now, ctimeMs: now })
    }
  }

  private entry(path: VaultPath): FileEntry {
    const times = this.times.get(path)
    const data = this.files.get(path)
    const entry: FileEntry = { path, name: baseName(path), kind: data === undefined ? 'dir' : 'file' }
    if (data !== undefined) entry.size = byteLength(data)
    if (times) {
      entry.mtimeMs = times.mtimeMs
      entry.ctimeMs = times.ctimeMs
    }
    return entry
  }

  private putFile(path: VaultPath, data: Data): void {
    this.ensureDirs(parentPath(path))
    this.files.set(path, typeof data === 'string' ? data : data.slice())
    const now = this.tick()
    this.times.set(path, { mtimeMs: now, ctimeMs: this.times.get(path)?.ctimeMs ?? now })
  }

  /** Store a file and describe the resulting event (not emitted). */
  private store(path: VaultPath, data: Data, origin: VaultEventOrigin): VaultEvent {
    const existed = this.files.has(path)
    this.putFile(path, data)
    return existed
      ? { type: 'change', path, hash: hashContent(data), origin }
      : { type: 'add', path, kind: 'file', origin }
  }

  private guardedWrite(path: VaultPath, data: Data, options: WriteOptions | undefined): WriteResult {
    this.assertAncestorsAreDirs(path)
    const current = this.files.get(path)
    const currentHash = current === undefined ? null : hashContent(current)
    if (options?.baseHash !== undefined && options.baseHash !== currentHash) {
      return { ok: false, reason: 'conflict', currentHash }
    }
    if (current === undefined) assertPortablePath(path)
    this.emit(this.store(path, data, 'self'))
    return { ok: true, hash: hashContent(data) }
  }

  /** Move a file or a folder subtree; `dst` must not exist and its parents must be folders. */
  private move(src: VaultPath, dst: VaultPath): void {
    const remap = (p: VaultPath): VaultPath => dst + p.slice(src.length)
    const files = [...this.files].filter(([p]) => isWithin(p, src))
    const dirs = [...this.dirs].filter((p) => isWithin(p, src))
    const times = new Map([...files.map(([p]) => p), ...dirs].map((p) => [p, this.times.get(p)] as const))
    this.remove(src)
    this.ensureDirs(parentPath(dst))
    for (const [p, data] of files) this.files.set(remap(p), data)
    for (const p of dirs) this.dirs.add(remap(p))
    for (const [p, t] of times) if (t) this.times.set(remap(p), t)
  }

  /** Drop a file or folder subtree. The parent folder stays. */
  private remove(path: VaultPath): void {
    for (const p of [...this.files.keys()]) {
      if (isWithin(p, path)) {
        this.files.delete(p)
        this.times.delete(p)
      }
    }
    for (const p of [...this.dirs]) {
      if (isWithin(p, path)) {
        this.dirs.delete(p)
        this.times.delete(p)
      }
    }
  }

  private freeTrashPath(path: VaultPath): VaultPath {
    const target = `${TRASH_ROOT}/${path}`
    if (this.kindOf(target) === null) return target
    const name = baseName(target)
    const dot = name.lastIndexOf('.')
    const [stem, ext] = dot > 0 ? [name.slice(0, dot), name.slice(dot)] : [name, '']
    for (let n = 2; ; n++) {
      const candidate = `${parentPath(target)}/${stem} ${n}${ext}`
      if (this.kindOf(candidate) === null) return candidate
    }
  }
}

/** Split `---\n<yaml>\n---\n<body>`. `yaml` is null when there is no (terminated) frontmatter block. */
function splitFrontmatter(text: string): { yaml: string | null; body: string } {
  const open = /^---[ \t]*\r?\n/.exec(text)
  if (!open) return { yaml: null, body: text }
  let pos = open[0].length
  for (;;) {
    const eol = text.indexOf('\n', pos)
    const line = text.slice(pos, eol === -1 ? text.length : eol).replace(/\r$/, '')
    if (/^(---|\.\.\.)[ \t]*$/.test(line)) {
      return { yaml: text.slice(open[0].length, pos), body: eol === -1 ? '' : text.slice(eol + 1) }
    }
    if (eol === -1) return { yaml: null, body: text }
    pos = eol + 1
  }
}

/**
 * Cordis plugin providing an in-memory `vault` service, seeded with `files`
 * (vault path to text content). Use as `await ctx.plugin(createMemoryVault({...}))`.
 */
export function createMemoryVault(files: Record<string, string> = {}): new (ctx: Context) => MemoryVault {
  return class MemoryVaultPlugin extends MemoryVault {
    constructor(ctx: Context) {
      super(ctx, files)
    }
  }
}

/** Typed access to the memory vault (and its `external` helpers) on a context that injected `vault`. */
export function getMemoryVault(ctx: Context): MemoryVault {
  const vault = ctx.vault as Partial<MemoryVault>
  if (!vault.external) throw new Error('ctx.vault is not a memory vault (was createMemoryVault() installed?)')
  return vault as MemoryVault
}
