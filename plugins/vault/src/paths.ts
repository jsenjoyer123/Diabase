// Pure vault-path handling (no Node APIs), shared by the fs vault and the
// in-memory vault. Containment against symlinks is the fs layer's job
// (`containment.ts`); this module only validates and normalizes text.
// Ported from Noteriv desktop/src/lib/knowledge/path-safety.ts (MIT, (c) 2026 Jace) — adapted for Diabase.
import type { VaultPath } from '@diabase/protocol'
import { VaultError } from './errors.ts'

const MAX_PATH_LENGTH = 1024
const CONTROL_CHARS = /[\u0000-\u001f\u007f]/
const WINDOWS_RESERVED_NAME = /^(con|prn|aux|nul|com[1-9]|lpt[1-9])(?:\.|$)/i
const WINDOWS_UNSAFE_CHARS = /[<>:"|?*]/

/**
 * Split a caller-supplied vault path into validated segments. `.` and empty
 * segments (`a//b`, trailing `/`) are dropped; `..` is kept so the fs layer can
 * apply it to the *real* directory (a symlinked dir's `..` is its real parent).
 *
 * Throws `EINVALIDPATH` for non-strings, NUL/control characters, backslashes,
 * absolute paths (`/x`, `C:x`) and over-long paths; `EOUTSIDE` when `..`
 * climbs above the vault root textually. `''` (or `'.'`, `'/'`-free variants
 * of them) is the vault root and yields `[]`.
 */
export function splitVaultPath(input: unknown): string[] {
  if (typeof input !== 'string') throw new VaultError('EINVALIDPATH', String(input), 'Vault paths must be strings')
  const path = input
  if (path.length > MAX_PATH_LENGTH) throw new VaultError('EINVALIDPATH', path, 'Path is too long')
  if (CONTROL_CHARS.test(path)) throw new VaultError('EINVALIDPATH', path, 'Path contains control characters')
  if (path.includes('\\')) throw new VaultError('EINVALIDPATH', path, 'Use "/" as the path separator')
  if (path.startsWith('/') || /^[a-z]:/i.test(path)) {
    throw new VaultError('EINVALIDPATH', path, 'Vault paths are relative to the vault root')
  }
  const segments: string[] = []
  let depth = 0
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (depth === 0) throw new VaultError('EOUTSIDE', path, 'Path escapes the vault root')
      depth--
    } else {
      depth++
    }
    segments.push(segment)
  }
  return segments
}

/** Validate and textually collapse a vault path: `./a//b/../c.md` → `a/c.md`; root → `''`. */
export function normalizeVaultPath(input: unknown): VaultPath {
  const out: string[] = []
  for (const segment of splitVaultPath(input)) {
    if (segment === '..') out.pop()
    else out.push(segment)
  }
  return out.join('/')
}

/**
 * Stricter check for paths about to be *created* (write to a new file, mkdir,
 * rename target): refuse names that are unsafe on any desktop platform, so a
 * vault synced between Linux, macOS and Windows stays usable. Existing files
 * with such names can still be read, written in place and deleted.
 */
export function assertPortablePath(path: VaultPath): void {
  for (const segment of path.split('/')) {
    if (WINDOWS_UNSAFE_CHARS.test(segment) || /[. ]$/.test(segment)) {
      throw new VaultError('EINVALIDPATH', path, `"${segment}" contains characters that are unsafe across platforms`)
    }
    if (WINDOWS_RESERVED_NAME.test(segment)) {
      throw new VaultError('EINVALIDPATH', path, `"${segment}" is a reserved file name`)
    }
  }
}

export function joinVaultPath(...parts: string[]): VaultPath {
  return normalizeVaultPath(parts.filter((p) => p !== '').join('/'))
}

/** Parent folder of a normalized path; `''` for top-level entries and the root. */
export function parentPath(path: VaultPath): VaultPath {
  const i = path.lastIndexOf('/')
  return i === -1 ? '' : path.slice(0, i)
}

export function baseName(path: VaultPath): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** Lower-cased extension including the dot (`.md`), or `''`. Dot-files have none. */
export function extName(path: VaultPath): string {
  const name = baseName(path)
  const i = name.lastIndexOf('.')
  return i <= 0 ? '' : name.slice(i).toLowerCase()
}

/** True when `path` is `dir` itself or lies below it (segment boundary aware; `''` contains everything). */
export function isWithin(path: VaultPath, dir: VaultPath): boolean {
  return dir === '' || path === dir || path.startsWith(`${dir}/`)
}

/** True when any segment starts with a dot (`.diabase/…`, `notes/.draft.md`). */
export function isHiddenPath(path: VaultPath): boolean {
  return path.split('/').some((segment) => segment.startsWith('.'))
}
