// Import resolution over the snapshot (README §2). Pure: no I/O, no esbuild types at runtime.
import { isBuiltin } from 'node:module'
import type { ImportKind } from 'esbuild'
import { dirname, extname, INDEX_EXTENSIONS, normalizePosix, RESOLVE_EXTENSIONS } from './paths.ts'

export type Resolution =
  /** A file of the snapshot (block-relative path). */
  | { type: 'file'; path: string }
  /** Left to the host: emitted as `require("<specifier>")` (shared modules) or kept verbatim (CSS `data:`/`#` urls). */
  | { type: 'external'; specifier: string }
  | { type: 'error'; text: string }

export interface ResolveEnv {
  /** Whether a block-relative path is a (supported) file of the snapshot. */
  hasFile(path: string): boolean
  /** Whether a block-relative path is a file with an unsupported extension. */
  isIgnored(path: string): boolean
  /** The vault directory for dir builds, `null` for drafts. */
  dir: string | null
  shared: ReadonlySet<string>
}

const CSS_KINDS: ReadonlySet<ImportKind> = new Set(['import-rule', 'url-token', 'composes-from'])

const URL_SCHEME = /^[A-Za-z][A-Za-z0-9+.-]*:/
const WINDOWS_DRIVE = /^[A-Za-z]:[\\/]/

const KERNEL_HINT_NAMES = new Set(['cordis', '@diabase/kernel'])

function isKernelSpecifier(specifier: string): boolean {
  return (
    KERNEL_HINT_NAMES.has(specifier) ||
    specifier.startsWith('cordis/') ||
    specifier.startsWith('@diabase/kernel/') ||
    specifier.startsWith('@cordisjs/')
  )
}

function error(text: string): Resolution {
  return { type: 'error', text }
}

function scopeName(env: ResolveEnv): { outside: string; missing: string } {
  return env.dir === null
    ? { outside: "inside the draft's own files", missing: 'in the draft' }
    : { outside: `inside '${env.dir}'`, missing: 'in the block directory' }
}

/** File candidates for a normalized block-relative path, in resolution order (README §2). */
function* candidates(path: string): Generator<string> {
  if (path === '') {
    // `import './'` or `'..'` landing on the block root: only its index files can match.
    for (const e of INDEX_EXTENSIONS) yield `index${e}`
    return
  }
  yield path
  const ext = extname(path)
  if (ext === '.js' || ext === '.jsx') {
    // TypeScript ESM style: `./x.js` names `x.ts` / `x.tsx` on disk.
    const stem = path.slice(0, -ext.length)
    yield `${stem}.ts`
    yield `${stem}.tsx`
  }
  for (const e of RESOLVE_EXTENSIONS) yield `${path}${e}`
  for (const e of INDEX_EXTENSIONS) yield `${path}/index${e}`
}

function resolveRelative(env: ResolveEnv, specifier: string, importer: string): Resolution {
  const scope = scopeName(env)
  if (specifier.includes('\\')) {
    return error(`Import '${specifier}' uses a backslash. Use '/' in import paths.`)
  }
  const base = dirname(importer)
  const normalized = normalizePosix(base === '' ? specifier : `${base}/${specifier}`)
  if (normalized === null) {
    return error(`Import '${specifier}' resolves outside the block directory. Blocks can only import files ${scope.outside}.`)
  }
  for (const candidate of candidates(normalized)) {
    if (env.hasFile(candidate)) return { type: 'file', path: candidate }
    if (candidate === normalized && env.isIgnored(candidate)) {
      return error(`Unsupported file type '${extname(candidate) || candidate}' ('${specifier}').`)
    }
  }
  return error(`Could not resolve '${specifier}' from '${importer}': no such file ${scope.missing}.`)
}

/**
 * Resolves one import. `importer` is the block-relative path of the importing file (`''` is not
 * valid here; the virtual entry is handled by the caller).
 */
export function resolveImport(env: ResolveEnv, specifier: string, kind: ImportKind, importer: string): Resolution {
  const fromCss = CSS_KINDS.has(kind)

  if (specifier === '') return error('Empty import path.')

  // CSS keeps `url(data:…)` and `url(#fragment)` as they are.
  if (kind === 'url-token' && (specifier.startsWith('data:') || specifier.startsWith('#'))) {
    return { type: 'external', specifier }
  }

  // Protocol-relative URLs first: they also start with '/'.
  if (specifier.startsWith('//')) return error('URL imports are not supported in blocks.')

  if (specifier.startsWith('/') || specifier.startsWith('\\') || WINDOWS_DRIVE.test(specifier)) {
    const scope = scopeName(env)
    return error(`Import '${specifier}' resolves outside the block directory. Blocks can only import files ${scope.outside}.`)
  }

  if (specifier.startsWith('node:')) return builtinError(specifier)
  if (URL_SCHEME.test(specifier)) return error('URL imports are not supported in blocks.')

  const isRelativeForm = specifier === '.' || specifier === '..' || specifier.startsWith('./') || specifier.startsWith('../')
  // CSS `@import "b.css"` / `url(p.png)` / `composes … from "b.css"` are relative to the stylesheet.
  if (isRelativeForm || fromCss) return resolveRelative(env, specifier, importer)

  if (isBuiltin(specifier)) return builtinError(specifier)

  if (env.shared.has(specifier)) {
    if (kind === 'dynamic-import') {
      return error(`Dynamic import() of '${specifier}' is not supported; use a static import.`)
    }
    if (kind === 'require-resolve') {
      return error(`require.resolve('${specifier}') is not supported in blocks.`)
    }
    return { type: 'external', specifier }
  }

  const available = [...env.shared].join(', ')
  let text = `Package '${specifier}' is not available to blocks. Available modules: ${available}.`
  if (isKernelSpecifier(specifier)) {
    text += " Blocks reach Cordis, the UI kit and services through '@diabase/sdk'."
  }
  return error(text)
}

function builtinError(specifier: string): Resolution {
  return error(
    `Node built-in module '${specifier}' is not available: blocks run in the renderer without Node. Read and write vault files through @diabase/sdk.`,
  )
}
