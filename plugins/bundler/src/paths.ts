// POSIX path helpers and the extension -> esbuild loader table (README §3). Pure; no I/O.
import type { Loader } from 'esbuild'

/** Extensions probed for an extension-less relative import, in order (README §2). */
export const RESOLVE_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js', '.json', '.css'] as const
/** Extensions probed for `<dir>/index.*`. */
export const INDEX_EXTENSIONS = ['.tsx', '.ts', '.jsx', '.js'] as const
/** Extensions an entry file may have. */
export const ENTRY_EXTENSIONS: readonly string[] = INDEX_EXTENSIONS

const LOADERS: Readonly<Record<string, Loader>> = {
  '.tsx': 'tsx',
  '.ts': 'ts',
  '.jsx': 'jsx',
  '.js': 'jsx',
  '.json': 'json',
  '.css': 'css',
  '.md': 'text',
  '.txt': 'text',
  '.svg': 'dataurl',
  '.png': 'dataurl',
  '.jpg': 'dataurl',
  '.jpeg': 'dataurl',
  '.gif': 'dataurl',
  '.webp': 'dataurl',
}

/** Supported extensions whose content is read as bytes (everything else is read as UTF-8 text). */
const BINARY_EXTENSIONS: ReadonlySet<string> = new Set(['.png', '.jpg', '.jpeg', '.gif', '.webp'])

export const MODULE_CSS_SUFFIX = '.module.css'

export function basename(path: string): string {
  return path.slice(path.lastIndexOf('/') + 1)
}

/** `''` for the root. */
export function dirname(path: string): string {
  const i = path.lastIndexOf('/')
  return i < 0 ? '' : path.slice(0, i)
}

/** Lower-cased extension including the dot (`.tsx`), or `''` (no dot, or a dotfile such as `.env`). */
export function extname(path: string): string {
  const base = basename(path)
  const i = base.lastIndexOf('.')
  return i <= 0 ? '' : base.slice(i).toLowerCase()
}

export function isModuleCss(path: string): boolean {
  return path.toLowerCase().endsWith(MODULE_CSS_SUFFIX)
}

/** The esbuild loader for a snapshot path, or `undefined` when the extension is not supported. */
export function loaderFor(path: string): Loader | undefined {
  if (isModuleCss(path)) return 'local-css'
  return LOADERS[extname(path)]
}

export function isSupportedFile(path: string): boolean {
  return loaderFor(path) !== undefined
}

export function isBinaryFile(path: string): boolean {
  return BINARY_EXTENSIONS.has(extname(path))
}

/**
 * Resolves `.` and `..` segments of a POSIX path. Returns `null` when the path climbs above its
 * root. Empty segments are dropped, so the result never has a leading, trailing or doubled slash.
 */
export function normalizePosix(path: string): string | null {
  const out: string[] = []
  for (const segment of path.split('/')) {
    if (segment === '' || segment === '.') continue
    if (segment === '..') {
      if (out.length === 0) return null
      out.pop()
    } else {
      out.push(segment)
    }
  }
  return out.join('/')
}

const CONTROL_CHARS = /[\u0000-\u001f\u007f]/

/**
 * Strict form for draft keys and entries: relative POSIX path with no `\`, no leading or trailing
 * `/`, no `.`/`..`/empty segments and no control characters.
 */
export function isNormalizedRelativePath(path: string): boolean {
  if (path === '' || path.includes('\\') || CONTROL_CHARS.test(path)) return false
  return path.split('/').every((s) => s !== '' && s !== '.' && s !== '..')
}

/** Path segments that mark generated or private content, never part of a block's sources (README §1). */
export function isHiddenSegment(segment: string): boolean {
  return segment.startsWith('.') || segment === 'node_modules'
}

export function hasHiddenSegment(path: string): boolean {
  return path.split('/').some(isHiddenSegment)
}

export function hasControlChars(path: string): boolean {
  return CONTROL_CHARS.test(path)
}
