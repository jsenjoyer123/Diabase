// Virtual file system esbuild runs against: a custom namespace over the snapshot, so esbuild never
// reads the disk. Also the single place that maps virtual paths back to `Diagnostic.file` strings.
import type { Plugin } from 'esbuild'
import type { PathMapper } from './diagnostics.ts'
import { basename, dirname, isModuleCss, loaderFor, MODULE_CSS_SUFFIX } from './paths.ts'
import { resolveImport, type ResolveEnv } from './resolve.ts'
import { displayPath, sha256Hex, type Snapshot } from './snapshot.ts'

export const NAMESPACE = 'diabase-vfs'
/** Virtual entry module. Not a possible snapshot path (it has an empty segment). */
export const ENTRY_VPATH = '//entry.js'

export interface Vfs {
  readonly snapshot: Snapshot
  readonly env: ResolveEnv
  readonly mapper: PathMapper
  /** `NAMESPACE:ENTRY_VPATH`, the `location.file` esbuild reports for the virtual entry. */
  readonly entryStubFile: string
  /** Virtual path for a snapshot path (salted for `.module.css`). */
  vpathOf(path: string): string
  /** Snapshot path for a virtual path, `undefined` for the entry stub and unknown paths. */
  pathOf(vpath: string): string | undefined
  /** Display path of the real entry file. */
  readonly entryFile: string
}

/**
 * esbuild derives `.module.css` class names from the file's basename only, so two blocks'
 * `card.module.css` would both produce `.card_box`. A short salt in the virtual basename
 * (`card.<salt>.module.css` -> `.card_<salt>_box`) makes the names unique per input and path.
 */
function saltedModuleCssPath(path: string, hash: string): string {
  const salt = sha256Hex(`${hash}\0${path}`).slice(0, 8)
  const base = basename(path)
  const stem = base.slice(0, base.length - MODULE_CSS_SUFFIX.length)
  const dir = dirname(path)
  return `${dir === '' ? '' : `${dir}/`}${stem}.${salt}${MODULE_CSS_SUFFIX}`
}

function escapeRegExp(text: string): string {
  return text.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')
}

export function createVfs(snapshot: Snapshot, hash: string, shared: ReadonlySet<string>): Vfs {
  const toVirtual = new Map<string, string>()
  const toPath = new Map<string, string>()
  for (const path of snapshot.files.keys()) {
    const vpath = isModuleCss(path) ? saltedModuleCssPath(path, hash) : path
    toVirtual.set(path, vpath)
    toPath.set(vpath, path)
  }

  const ignored = new Set(snapshot.ignored)
  const prefix = `${NAMESPACE}:`
  const entryFile = displayPath(snapshot, snapshot.entry)
  const fileOf = (esbuildFile: string): string | undefined => {
    if (!esbuildFile.startsWith(prefix)) return undefined
    const path = toPath.get(esbuildFile.slice(prefix.length))
    return path === undefined ? undefined : displayPath(snapshot, path)
  }

  // One pass over free text: known virtual paths become display paths, longest first so that
  // `a.module.css` style prefixes cannot shadow longer paths. Leftover namespace prefixes are dropped.
  const known = [...toPath.keys()].sort((a, b) => b.length - a.length)
  const knownPattern = known.length > 0 ? new RegExp(known.map((v) => escapeRegExp(prefix + v)).join('|'), 'g') : null
  const scrub = (text: string): string => {
    const replaced = knownPattern ? text.replace(knownPattern, (m) => fileOf(m) ?? m) : text
    return replaced.split(prefix).join('')
  }

  return {
    snapshot,
    entryFile,
    entryStubFile: prefix + ENTRY_VPATH,
    env: {
      hasFile: (path) => snapshot.files.has(path),
      isIgnored: (path) => ignored.has(path),
      dir: snapshot.dir,
      shared,
    },
    mapper: { fileOf, scrub },
    vpathOf: (path) => toVirtual.get(path) ?? path,
    pathOf: (vpath) => toPath.get(vpath),
  }
}

/** esbuild plugin serving every module from the snapshot. */
export function vfsPlugin(vfs: Vfs): Plugin {
  const { snapshot } = vfs
  return {
    name: 'diabase-vfs',
    setup(build) {
      build.onResolve({ filter: /.*/ }, (args) => {
        if (args.kind === 'entry-point') return { path: ENTRY_VPATH, namespace: NAMESPACE }
        if (args.importer === ENTRY_VPATH) {
          return { path: vfs.vpathOf(snapshot.entry), namespace: NAMESPACE }
        }
        const importer = vfs.pathOf(args.importer)
        if (importer === undefined) {
          return { errors: [{ text: 'Internal bundler error: import from an unknown module.' }] }
        }
        const resolution = resolveImport(vfs.env, args.path, args.kind, importer)
        switch (resolution.type) {
          case 'file':
            return { path: vfs.vpathOf(resolution.path), namespace: NAMESPACE }
          case 'external':
            return { path: resolution.specifier, external: true }
          case 'error':
            return { errors: [{ text: resolution.text }] }
        }
      })

      build.onLoad({ filter: /.*/, namespace: NAMESPACE }, (args) => {
        if (args.path === ENTRY_VPATH) {
          return { contents: `export { default } from ${JSON.stringify(`./${snapshot.entry}`)}\n`, loader: 'js' }
        }
        const path = vfs.pathOf(args.path)
        const file = path === undefined ? undefined : snapshot.files.get(path)
        const loader = path === undefined ? undefined : loaderFor(path)
        if (file === undefined || loader === undefined) {
          return { errors: [{ text: 'Internal bundler error: unknown module.' }] }
        }
        return { contents: file.text ?? file.bytes ?? '', loader }
      })
    },
  }
}
