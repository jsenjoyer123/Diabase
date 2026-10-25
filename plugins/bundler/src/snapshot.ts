// Snapshot: the in-memory file map a build works on (README §1). A dir build reads the whole block
// directory through `ctx.vault` first; a draft provides the map directly. Everything after this
// step (hashing, resolving, loading) is pure and never touches the real file system.
import { createHash } from 'node:crypto'
import type { BuildInput, Diagnostic, VaultService } from '@diabase/protocol'
import { diagnostic } from './diagnostics.ts'
import {
  ENTRY_EXTENSIONS,
  extname,
  hasControlChars,
  hasHiddenSegment,
  isBinaryFile,
  isNormalizedRelativePath,
  isSupportedFile,
} from './paths.ts'

export interface SnapshotFile {
  /** UTF-8 byte length. */
  size: number
  /** Hex sha256 of the bytes. */
  sha256: string
  /** Text files (code, JSON, CSS, `.md`, `.txt`, `.svg`). */
  text?: string
  /** Binary assets (`.png`, `.jpg`, `.jpeg`, `.gif`, `.webp`). */
  bytes?: Uint8Array
}

export interface Snapshot {
  kind: 'dir' | 'draft'
  /** `BundleRegistration.id`: the normalized dir, or `draft:<entry>`. */
  id: string
  /** Normalized vault directory (dir builds), else `null`. */
  dir: string | null
  /** Block-relative path of the entry file. Always present in `files`. */
  entry: string
  /** Supported files by block-relative POSIX path. */
  files: ReadonlyMap<string, SnapshotFile>
  /** Block-relative paths of files with an unsupported extension (importable only to explain the error). */
  ignored: readonly string[]
}

export type SnapshotOutcome = { ok: true; snapshot: Snapshot } | { ok: false; errors: Diagnostic[] }

export interface SnapshotLimits {
  maxFiles: number
  maxFileBytes: number
  maxInputBytes: number
}

export type VaultReader = Pick<VaultService, 'list' | 'read' | 'readBinary'>

export type NormalizedInput =
  | { kind: 'dir'; dir: string; entry: string }
  | { kind: 'draft'; files: Record<string, unknown>; entry: string }

/** Cap on tracked unsupported files; beyond it an import of one reads as "no such file". */
const MAX_IGNORED = 1024
/** Parallel vault reads per snapshot. */
const READ_CONCURRENCY = 8

/** `Diagnostic.file` for a block-relative path. */
export function displayPath(snapshot: Pick<Snapshot, 'dir'>, path: string): string {
  return snapshot.dir === null ? path : `${snapshot.dir}/${path}`
}

export function sha256Hex(data: string | Uint8Array): string {
  return createHash('sha256').update(data).digest('hex')
}

// --- input normalization ---------------------------------------------------------------------

function normalizeDir(raw: string): string | null {
  if (raw === '' || raw.startsWith('/') || raw.includes('\\') || hasControlChars(raw)) return null
  const trimmed = raw.endsWith('/') ? raw.replace(/\/+$/, '') : raw
  if (trimmed === '') return null
  const segments = trimmed.split('/')
  if (segments.some((s) => s === '' || s === '.' || s === '..')) return null
  return trimmed
}

function normalizeEntry(raw: string): string | null {
  const stripped = raw.startsWith('./') ? raw.slice(2) : raw
  return isNormalizedRelativePath(stripped) ? stripped : null
}

export function normalizeInput(
  input: BuildInput,
): { ok: true; value: NormalizedInput } | { ok: false; errors: Diagnostic[] } {
  const fail = (text: string) => ({ ok: false as const, errors: [diagnostic(text)] })
  if (typeof input !== 'object' || input === null) {
    return fail('Invalid build input: expected { dir, entry? } or { files, entry }.')
  }
  const rawEntry = (input as { entry?: unknown }).entry
  if ('dir' in input && typeof input.dir === 'string') {
    const dir = normalizeDir(input.dir)
    if (dir === null) {
      return fail(
        `Invalid block directory '${input.dir}': use a vault-relative path such as '.diabase/blocks/user/shelf' (no leading '/', '..' segments or backslashes).`,
      )
    }
    if (rawEntry !== undefined && typeof rawEntry !== 'string') return fail('Invalid build input: entry must be a string.')
    const entryRaw = rawEntry ?? 'index.tsx'
    const entry = normalizeEntry(entryRaw)
    if (entry === null) {
      return fail(`Block entry '${entryRaw}' must be a relative path inside the block directory.`)
    }
    if (!ENTRY_EXTENSIONS.includes(extname(entry))) {
      return fail(`Block entry '${entry}' must be a .tsx, .ts, .jsx or .js file.`)
    }
    return { ok: true, value: { kind: 'dir', dir, entry } }
  }
  if ('files' in input && typeof input.files === 'object' && input.files !== null) {
    if (typeof rawEntry !== 'string') return fail('Invalid build input: a draft needs an entry file name.')
    const entry = normalizeEntry(rawEntry)
    if (entry === null) {
      return fail(`Block entry '${rawEntry}' must be a relative path of one of the draft's files.`)
    }
    if (!ENTRY_EXTENSIONS.includes(extname(entry))) {
      return fail(`Block entry '${entry}' must be a .tsx, .ts, .jsx or .js file.`)
    }
    return { ok: true, value: { kind: 'draft', files: input.files as Record<string, unknown>, entry } }
  }
  return fail('Invalid build input: expected { dir, entry? } or { files, entry }.')
}

// --- shared assembly -------------------------------------------------------------------------

function listSources(paths: Iterable<string>, limit = 10): string {
  const all = [...paths].sort()
  const shown = all.slice(0, limit).join(', ')
  return all.length > limit ? `${shown}, … (${all.length} files)` : shown
}

function limitErrors(limits: SnapshotLimits, count: number): Diagnostic | undefined {
  if (count > limits.maxFiles) {
    return diagnostic(
      `Too many source files: found ${count}, the limit is ${limits.maxFiles} (maxFiles). Remove files the block does not import.`,
    )
  }
  return undefined
}

function fileTooLarge(file: string, size: number, limits: SnapshotLimits): Diagnostic {
  return diagnostic(
    `File '${file}' is too large: ${size} bytes, the limit is ${limits.maxFileBytes} (maxFileBytes).`,
    { file },
  )
}

function inputTooLarge(limits: SnapshotLimits): Diagnostic {
  return diagnostic(
    `Block sources are too large: more than ${limits.maxInputBytes} bytes in total (maxInputBytes). Remove files the block does not import.`,
  )
}

function toFile(content: string | Uint8Array): SnapshotFile {
  if (typeof content === 'string') {
    const bytes = Buffer.from(content, 'utf8')
    return { size: bytes.byteLength, sha256: sha256Hex(bytes), text: content }
  }
  return { size: content.byteLength, sha256: sha256Hex(content), bytes: content }
}

function assemble(
  base: Pick<Snapshot, 'kind' | 'id' | 'dir' | 'entry'>,
  files: Map<string, SnapshotFile>,
  ignored: string[],
): SnapshotOutcome {
  const sorted = new Map([...files].sort(([a], [b]) => (a < b ? -1 : a > b ? 1 : 0)))
  return {
    ok: true,
    snapshot: { ...base, files: sorted, ignored: ignored.sort().slice(0, MAX_IGNORED) },
  }
}

// --- drafts ----------------------------------------------------------------------------------

export function snapshotDraft(
  value: Extract<NormalizedInput, { kind: 'draft' }>,
  limits: SnapshotLimits,
): SnapshotOutcome {
  const errors: Diagnostic[] = []
  const supported: Array<[string, string]> = []
  const ignored: string[] = []
  for (const key of Object.keys(value.files).sort()) {
    const content = value.files[key]
    if (!isNormalizedRelativePath(key)) {
      errors.push(
        diagnostic(
          `Invalid draft file name '${key}': keys must be relative POSIX paths without a leading '/', backslashes, or '.', '..' and empty segments.`,
        ),
      )
      continue
    }
    if (typeof content !== 'string') {
      errors.push(diagnostic(`Draft file '${key}' must be a string.`, { file: key }))
      continue
    }
    if (hasHiddenSegment(key)) continue
    if (isSupportedFile(key)) supported.push([key, content])
    else ignored.push(key)
  }
  if (errors.length > 0) return { ok: false, errors }

  const tooMany = limitErrors(limits, supported.length)
  if (tooMany) return { ok: false, errors: [tooMany] }

  const files = new Map<string, SnapshotFile>()
  let total = 0
  for (const [key, content] of supported) {
    const file = toFile(content)
    if (file.size > limits.maxFileBytes) errors.push(fileTooLarge(key, file.size, limits))
    total += file.size
    files.set(key, file)
  }
  if (errors.length > 0) return { ok: false, errors }
  if (total > limits.maxInputBytes) return { ok: false, errors: [inputTooLarge(limits)] }

  if (!files.has(value.entry)) {
    return {
      ok: false,
      errors: [
        diagnostic(`Draft has no entry '${value.entry}'. Source files: ${listSources(files.keys()) || '(none)'}.`, {
          file: value.entry,
        }),
      ],
    }
  }
  return assemble({ kind: 'draft', id: `draft:${value.entry}`, dir: null, entry: value.entry }, files, ignored)
}

// --- vault directories -----------------------------------------------------------------------

/** Thrown inside the snapshot step to unwind with a ready-made diagnostic. */
class SnapshotFailure extends Error {
  constructor(readonly diagnostics: Diagnostic[]) {
    super(diagnostics[0]?.text ?? 'snapshot failed')
  }
}

function vaultErrorCode(error: unknown): string | undefined {
  if (typeof error !== 'object' || error === null) return undefined
  const e = error as { name?: unknown; code?: unknown }
  return e.name === 'VaultError' && typeof e.code === 'string' ? e.code : undefined
}

function describeVaultError(error: unknown, dir: string, file?: string): Diagnostic {
  const code = vaultErrorCode(error)
  if (file === undefined) {
    switch (code) {
      case 'ENOENT':
        return diagnostic(`Block directory '${dir}' does not exist.`)
      case 'ENOTDIR':
        return diagnostic(`'${dir}' is not a directory.`)
      case 'EOUTSIDE':
        return diagnostic(`Block directory '${dir}' is outside the vault.`)
      case 'EINVALIDPATH':
        return diagnostic(`'${dir}' is not a valid vault path.`)
      default:
        return diagnostic(`Could not list block directory '${dir}'${code ? ` (${code})` : ''}.`)
    }
  }
  const full = `${dir}/${file}`
  if (code === 'ENOENT') {
    return diagnostic(`File '${full}' disappeared while the block was being read. Try the build again.`, { file: full })
  }
  return diagnostic(`Could not read '${full}'${code ? ` (${code})` : ''}.`, { file: full })
}

/** Runs `fn` for every item with bounded parallelism; the first failure wins and stops new work. */
async function forEachPooled<T>(
  items: readonly T[],
  limit: number,
  signal: AbortSignal,
  fn: (item: T) => Promise<void>,
): Promise<void> {
  let next = 0
  let failed = false
  let failure: unknown
  const worker = async () => {
    while (!failed && next < items.length) {
      const item = items[next++] as T
      try {
        signal.throwIfAborted()
        await fn(item)
      } catch (error) {
        if (!failed) {
          failed = true
          failure = error
        }
        return
      }
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, items.length) }, worker))
  if (failed) throw failure
}

export async function snapshotDir(
  vault: VaultReader,
  value: Extract<NormalizedInput, { kind: 'dir' }>,
  limits: SnapshotLimits,
  signal: AbortSignal,
): Promise<SnapshotOutcome> {
  const { dir, entry } = value
  try {
    signal.throwIfAborted()
    let listing
    try {
      listing = await vault.list(dir, { recursive: true, includeHidden: true })
    } catch (error) {
      signal.throwIfAborted()
      throw new SnapshotFailure([describeVaultError(error, dir)])
    }
    signal.throwIfAborted()

    const prefix = `${dir}/`
    const supported: Array<{ rel: string; size: number | undefined }> = []
    const ignored: string[] = []
    for (const item of listing) {
      if (item.kind !== 'file' || !item.path.startsWith(prefix)) continue
      const rel = item.path.slice(prefix.length)
      if (rel === '' || rel.includes('\\') || hasControlChars(rel) || hasHiddenSegment(rel)) continue
      if (isSupportedFile(rel)) supported.push({ rel, size: item.size })
      else ignored.push(rel)
    }
    supported.sort((a, b) => (a.rel < b.rel ? -1 : a.rel > b.rel ? 1 : 0))

    const tooMany = limitErrors(limits, supported.length)
    if (tooMany) throw new SnapshotFailure([tooMany])

    // Cheap rejection from the listing's sizes before any content is read.
    const oversized = supported.filter((f) => f.size !== undefined && f.size > limits.maxFileBytes)
    if (oversized.length > 0) {
      throw new SnapshotFailure(oversized.map((f) => fileTooLarge(`${prefix}${f.rel}`, f.size!, limits)))
    }

    if (!supported.some((f) => f.rel === entry)) {
      const available = listSources(supported.map((f) => f.rel))
      throw new SnapshotFailure([
        diagnostic(
          `Block directory '${dir}' has no entry '${entry}'.${available ? ` Source files: ${available}.` : ''}`,
          { file: `${prefix}${entry}` },
        ),
      ])
    }

    const files = new Map<string, SnapshotFile>()
    let total = 0
    await forEachPooled(supported, READ_CONCURRENCY, signal, async ({ rel }) => {
      let content: string | Uint8Array
      try {
        content = isBinaryFile(rel) ? await vault.readBinary(`${prefix}${rel}`) : (await vault.read(`${prefix}${rel}`)).content
      } catch (error) {
        signal.throwIfAborted()
        throw new SnapshotFailure([describeVaultError(error, dir, rel)])
      }
      signal.throwIfAborted()
      const file = toFile(content)
      if (file.size > limits.maxFileBytes) throw new SnapshotFailure([fileTooLarge(`${prefix}${rel}`, file.size, limits)])
      total += file.size
      if (total > limits.maxInputBytes) throw new SnapshotFailure([inputTooLarge(limits)])
      files.set(rel, file)
    })

    return assemble({ kind: 'dir', id: dir, dir, entry }, files, ignored)
  } catch (error) {
    if (error instanceof SnapshotFailure) return { ok: false, errors: error.diagnostics }
    throw error
  }
}
