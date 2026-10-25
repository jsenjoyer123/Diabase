// Main-process plugin loader (Node only: import via `@diabase/kernel/main`).
//
// Discovers `.diabase/plugins/*/diabase.plugin.json` through `ctx.vault`, reads
// `.diabase/config.yml`, and plugs the `main` entry of every enabled plugin into this
// service's context. Plugins are children of the loader's fiber, so disposing the loader
// (or losing `vault`) disposes them all.
//
// Known limitations:
// - Only the entry URL is cache-busted (`?diabase-rev=`), so a plugin should ship a single
//   bundled ESM file; its own relative imports are cached by Node for the process lifetime.
// - Old revisions stay in Node's module cache (ESM modules cannot be evicted).
// - Vault-installed plugins have no module resolution, so they cannot import
//   `@diabase/kernel`: they may only use the `ctx` they are given.
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import { pathToFileURL } from 'node:url'
import { isDeepStrictEqual } from 'node:util'
import { parseDocument } from 'yaml'
import { CONFIG_FILE, DIABASE_DIR, DiabaseConfig, PLUGINS_DIR, PluginManifest } from '@diabase/protocol'
import type { FileEntry, VaultEvent, VaultPath } from '@diabase/protocol'
import { Service } from '../index.ts'
import type { Context, Fiber, Plugin } from '../index.ts'
import type {
  PluginLoaderConfig,
  PluginLoadState,
  PluginLoaderService,
  PluginStatus,
  RendererEntry,
} from '../loader-types.ts'

export type Importer = (url: string) => Promise<unknown>

export interface PluginLoaderOptions extends PluginLoaderConfig {
  /** Test seam: replaces the native `import()`. Never set over IPC. */
  importer?: Importer
}

const MANIFEST_FILE = 'diabase.plugin.json'
const DEFAULT_DEBOUNCE = 150

const nativeImport: Importer = (url) => import(/* @vite-ignore */ url)

interface Entry {
  /** Vault path, e.g. `.diabase/plugins/hello/index.mjs`. */
  path: VaultPath
  /** Real absolute path, symlinks resolved and checked to stay inside the plugin dir. */
  abs: string
}

interface Scanned {
  id: string
  dir: VaultPath
  manifest: PluginManifest | null
  manifestHash?: string
  /** Set when the plugin is unusable: state `invalid`. */
  error?: string
  main?: Entry
  /** Hash of the main file; only read for enabled plugins. */
  mainHash?: string
  renderer?: Entry
}

interface Loaded {
  /** Identity of the running code: dir + manifest hash + main hash + forced revision. */
  key: string
  config: Record<string, unknown> | undefined
  fiber?: Fiber
  error?: string
}

interface Wanted {
  scanned: Scanned & { main: Entry }
  config: Record<string, unknown> | undefined
  key: string
}

// FiberState is an ambient const enum (TS2748 under isolatedModules), so map the numbers here.
function fiberLoadState(fiber: Fiber): PluginLoadState {
  const state: number = fiber.state
  switch (state) {
    case 0: return 'pending'
    case 2: return 'active'
    case 3: return 'failed'
    default: return 'loading'
  }
}

const sha256 = (...parts: string[]) => {
  const hash = createHash('sha256')
  for (const part of parts) hash.update(part).update('\0')
  return hash.digest('hex')
}

const errorMessage = (error: unknown) =>
  typeof (error as { message?: unknown } | null)?.message === 'string' ? (error as Error).message : String(error)

// `instanceof` is unreliable for errors that crossed realms or IPC, so match on the shape.
const isVaultError = (error: unknown, code: string) =>
  !!error && typeof error === 'object' && (error as { name?: unknown }).name === 'VaultError' &&
  (error as { code?: unknown }).code === code

const formatIssues = (issues: readonly { path: readonly PropertyKey[]; message: string }[]) =>
  issues.map((issue) => (issue.path.length ? `${issue.path.map(String).join('.')}: ` : '') + issue.message).join('; ')

const isPlugin = (value: unknown): boolean =>
  typeof value === 'function' ||
  (!!value && typeof value === 'object' && typeof (value as { apply?: unknown }).apply === 'function')

/** True for events under `.diabase/config.yml` or `.diabase/plugins/`, including the parent dirs themselves. */
function touchesLoader(event: VaultEvent): boolean {
  const paths = event.type === 'rename' ? [event.from, event.to] : [event.path]
  return paths.some(
    (p) => p === CONFIG_FILE || p === DIABASE_DIR || p === PLUGINS_DIR || p.startsWith(PLUGINS_DIR + '/'),
  )
}

/** YAML-friendly leniency: `plugins:` and `my-plugin:` with no value mean "empty". */
function lenientConfig(raw: unknown): unknown {
  if (raw === null || raw === undefined) return {}
  if (typeof raw !== 'object' || Array.isArray(raw)) return raw
  const obj = raw as Record<string, unknown>
  const plugins = obj.plugins
  if (plugins === null) return { ...obj, plugins: {} }
  if (plugins && typeof plugins === 'object' && !Array.isArray(plugins)) {
    const entries = Object.entries(plugins).map(([id, entry]) => [id, entry ?? {}] as const)
    return { ...obj, plugins: Object.fromEntries(entries) }
  }
  return raw
}

/** Relative POSIX path inside the plugin dir; `null` if it is anything else. */
function normalizeEntry(entry: string): string | null {
  if (!entry || entry.includes('\\') || entry.includes('\0') || entry.startsWith('/') || /^[a-zA-Z]:/.test(entry)) {
    return null
  }
  if (entry.split('/').includes('..')) return null
  const normalized = path.posix.normalize(entry)
  return normalized === '.' || normalized.endsWith('/') ? null : normalized
}

async function resolveEntry(root: string, dir: VaultPath, entry: string, label: string): Promise<Entry> {
  const rel = normalizeEntry(entry)
  if (!rel) throw new Error(`${label} entry "${entry}" must be a relative POSIX path without ".." inside the plugin directory`)
  let base: string
  let real: string
  try {
    base = await fs.realpath(path.resolve(root, dir))
    real = await fs.realpath(path.resolve(root, dir, rel))
  } catch {
    throw new Error(`${label} entry "${entry}" does not exist`)
  }
  const within = path.relative(base, real)
  if (!within || within === '..' || within.startsWith('..' + path.sep) || path.isAbsolute(within)) {
    throw new Error(`${label} entry "${entry}" resolves outside the plugin directory`)
  }
  if (!(await fs.stat(real)).isFile()) throw new Error(`${label} entry "${entry}" is not a file`)
  return { path: path.posix.join(dir, rel), abs: real }
}

type ConfigResult = { config: DiabaseConfig } | { error: string }

interface Batch {
  force: Set<string>
  done: Promise<void>
}

export class PluginLoader extends Service implements PluginLoaderService {
  static inject = ['vault']

  // Services are reached through Cordis proxies, so the public API is bound to the real
  // instance (private fields do not exist on a proxy).
  list = (): PluginStatus[] => this.#plugins.map((scanned) => this.#status(scanned))
  renderers = (): RendererEntry[] =>
    this.#plugins.flatMap((s) =>
      !s.error && s.renderer && this.#entryOf(s.id)?.enabled ? [{ id: s.id, dir: s.dir, entry: s.renderer.path }] : [],
    )
  reload = (id?: string): Promise<void> => {
    this.#cancelTimer()
    return this.#request(id)
  }
  configError = (): string | null => this.#configError

  #root: string
  #debounce: number
  #importer: Importer
  #plugins: Scanned[] = []
  #config: DiabaseConfig = { plugins: {} }
  #configError: string | null = null
  #loaded = new Map<string, Loaded>()
  #revs = new Map<string, number>()
  #batch: Batch | undefined
  #tail: Promise<void> = Promise.resolve()
  #timer: (() => unknown) | undefined
  #disposed = false

  constructor(ctx: Context, config: PluginLoaderOptions) {
    super(ctx, 'loader')
    if (typeof config?.root !== 'string' || !path.isAbsolute(config.root)) {
      throw new TypeError('PluginLoader: config.root must be an absolute path to the vault root')
    }
    this.#root = config.root
    this.#debounce = config.debounce ?? DEFAULT_DEBOUNCE
    this.#importer = config.importer ?? nativeImport
  }

  async [Service.init]() {
    this.ctx.on('vault/changed', (events) => {
      if (events.some(touchesLoader)) this.#schedule()
    })
    this.ctx.effect(() => async () => {
      this.#disposed = true
      this.#cancelTimer()
      // Let an in-flight reconcile unwind; it checks #alive() after every await.
      await this.#tail
    })
    await this.#request()
  }

  #alive() {
    return !this.#disposed && this.ctx.fiber.uid !== null
  }

  #entryOf(id: string) {
    const plugins = this.#config.plugins
    return Object.hasOwn(plugins, id) ? plugins[id] : undefined
  }

  #status(s: Scanned): PluginStatus {
    const entry = this.#entryOf(s.id)
    const status: PluginStatus = { id: s.id, dir: s.dir, manifest: s.manifest, enabled: !!entry?.enabled, state: 'disabled' }
    if (s.error) return { ...status, state: 'invalid', error: s.error }
    if (s.main) status.main = s.main.path
    if (s.renderer) status.renderer = s.renderer.path
    if (!entry?.enabled) return status
    if (!s.main) return { ...status, state: 'active' }
    const loaded = this.#loaded.get(s.id)
    if (!loaded) return { ...status, state: 'loading' }
    const state = loaded.fiber ? fiberLoadState(loaded.fiber) : loaded.error ? 'failed' : 'loading'
    if (state === 'failed') return { ...status, state, error: loaded.error ?? 'plugin failed, see the logs' }
    return { ...status, state }
  }

  #cancelTimer() {
    const stop = this.#timer
    this.#timer = undefined
    void stop?.()
  }

  #schedule() {
    if (!this.#alive()) return
    this.#cancelTimer()
    const fire = () => {
      this.#timer = undefined
      void stop()
      void this.#request()
    }
    const stop = this.ctx.effect(() => {
      const timeout = setTimeout(fire, this.#debounce)
      return () => clearTimeout(timeout)
    })
    this.#timer = stop
  }

  /** Serialized and coalesced: requests made while a run is in flight share one follow-up run. */
  #request(forceId?: string): Promise<void> {
    if (!this.#alive()) return Promise.resolve()
    let batch = this.#batch
    if (!batch) {
      const created: Batch = { force: new Set(), done: Promise.resolve() }
      created.done = this.#tail.then(() => {
        if (this.#batch === created) this.#batch = undefined
        return this.#alive() ? this.#run(created.force) : undefined
      })
      this.#tail = created.done
      this.#batch = batch = created
    }
    if (forceId !== undefined) batch.force.add(forceId)
    return batch.done
  }

  async #run(force: ReadonlySet<string>): Promise<void> {
    try {
      await this.#reconcile(force)
    } catch (error) {
      if (this.#alive()) this.ctx.logger.warn('plugin reconcile failed: %s', errorMessage(error))
    }
  }

  async #reconcile(force: ReadonlySet<string>): Promise<void> {
    const before = this.#snapshot()
    let changed = false

    const result = await this.#readConfig()
    if (!this.#alive()) return
    if ('error' in result) {
      this.#configError = result.error
    } else {
      this.#config = result.config
      this.#configError = null
    }

    const scanned = await this.#scan()
    if (!this.#alive()) return
    this.#plugins = scanned

    for (const id of force) {
      if (scanned.some((s) => s.id === id)) this.#revs.set(id, (this.#revs.get(id) ?? 0) + 1)
    }
    const wanted = new Map<string, Wanted>()
    for (const s of scanned) {
      const entry = this.#entryOf(s.id)
      if (s.error || !s.main || s.mainHash === undefined || !entry?.enabled) continue
      const key = sha256(s.dir, s.manifestHash ?? '', s.mainHash, String(this.#revs.get(s.id) ?? 0))
      wanted.set(s.id, { scanned: { ...s, main: s.main }, config: entry.config, key })
    }

    for (const [id, loaded] of [...this.#loaded]) {
      if (wanted.get(id)?.key === loaded.key) continue
      this.#loaded.delete(id)
      changed = true
      try {
        await loaded.fiber?.dispose()
      } catch (error) {
        this.ctx.logger.warn('disposing plugin %s failed: %s', id, errorMessage(error))
      }
      if (!this.#alive()) return
    }

    for (const [id, want] of wanted) {
      const loaded = this.#loaded.get(id)
      if (!loaded) {
        changed = true
        await this.#load(id, want)
      } else if (!isDeepStrictEqual(loaded.config, want.config)) {
        changed = true
        await this.#update(loaded, want.config)
      }
      if (!this.#alive()) return
    }

    // Let dependents of freshly provided services finish starting before the final snapshot.
    for (const loaded of this.#loaded.values()) await loaded.fiber?.await().catch(() => {})
    if (!this.#alive()) return

    if (changed || before !== this.#snapshot()) this.ctx.emit('loader/changed')
  }

  #snapshot() {
    return JSON.stringify([this.list(), this.#configError])
  }

  async #load(id: string, want: Wanted) {
    const loaded: Loaded = { key: want.key, config: want.config }
    this.#loaded.set(id, loaded)
    const url = pathToFileURL(want.scanned.main.abs).href + '?diabase-rev=' + want.key.slice(0, 16)
    let mod: unknown
    try {
      mod = await this.#importer(url)
    } catch (error) {
      loaded.error = `import failed: ${errorMessage(error)}`
      return
    }
    if (!this.#alive()) return
    const plugin = (mod as { default?: unknown } | null)?.default ?? mod
    if (!isPlugin(plugin)) {
      loaded.error = 'main entry must export a plugin: a function, or an object with an apply function'
      return
    }
    try {
      loaded.fiber = this.ctx.plugin(plugin as Plugin, structuredClone(want.config))
      await loaded.fiber
    } catch (error) {
      loaded.error = errorMessage(error)
    }
  }

  async #update(loaded: Loaded, config: Record<string, unknown> | undefined) {
    loaded.config = config
    if (!loaded.fiber) return
    try {
      await loaded.fiber.update(structuredClone(config))
      loaded.error = undefined
    } catch (error) {
      loaded.error = errorMessage(error)
    }
  }

  async #readConfig(): Promise<ConfigResult> {
    let content: string
    try {
      content = (await this.ctx.vault.read(CONFIG_FILE)).content
    } catch (error) {
      if (isVaultError(error, 'ENOENT')) return { config: { plugins: {} } }
      return { error: `cannot read ${CONFIG_FILE}: ${errorMessage(error)}` }
    }
    const doc = parseDocument(content)
    if (doc.errors.length) return { error: `${CONFIG_FILE}: ${doc.errors[0]!.message}` }
    let raw: unknown
    try {
      raw = doc.toJS()
    } catch (error) {
      return { error: `${CONFIG_FILE}: ${errorMessage(error)}` }
    }
    const parsed = DiabaseConfig.safeParse(lenientConfig(raw))
    if (!parsed.success) return { error: `invalid ${CONFIG_FILE}: ${formatIssues(parsed.error.issues)}` }
    return { config: parsed.data }
  }

  async #scan(): Promise<Scanned[]> {
    let entries: FileEntry[]
    try {
      entries = await this.ctx.vault.list(PLUGINS_DIR, { includeHidden: true })
    } catch (error) {
      if (isVaultError(error, 'ENOENT')) return []
      throw error
    }
    const dirs = entries
      .filter((entry) => entry.kind === 'dir' && !entry.name.startsWith('.'))
      .sort((a, b) => (a.name < b.name ? -1 : a.name > b.name ? 1 : 0))
    const scanned = await Promise.all(dirs.map((entry) => this.#scanOne(entry.name)))

    const owners = new Map<string, Scanned>()
    return scanned.map((s) => {
      if (!s.manifest || s.error) return s
      const owner = owners.get(s.id)
      if (!owner) {
        owners.set(s.id, s)
        return s
      }
      return { id: path.posix.basename(s.dir), dir: s.dir, manifest: s.manifest, error: `duplicate plugin id "${s.id}", already used by ${owner.dir}` }
    })
  }

  async #scanOne(name: string): Promise<Scanned> {
    const vault = this.ctx.vault
    const dir = `${PLUGINS_DIR}/${name}`
    const invalid = (error: string): Scanned => ({ id: name, dir, manifest: null, error })

    let file
    try {
      file = await vault.read(`${dir}/${MANIFEST_FILE}`)
    } catch (error) {
      return invalid(isVaultError(error, 'ENOENT') ? `missing ${MANIFEST_FILE}` : `cannot read ${MANIFEST_FILE}: ${errorMessage(error)}`)
    }
    let json: unknown
    try {
      json = JSON.parse(file.content)
    } catch (error) {
      return invalid(`${MANIFEST_FILE} is not valid JSON: ${errorMessage(error)}`)
    }
    const parsed = PluginManifest.safeParse(json)
    if (!parsed.success) return invalid(`invalid ${MANIFEST_FILE}: ${formatIssues(parsed.error.issues)}`)

    const manifest = parsed.data
    const result: Scanned = { id: manifest.id, dir, manifest, manifestHash: file.hash }
    try {
      if (manifest.main !== undefined) result.main = await resolveEntry(this.#root, dir, manifest.main, 'main')
      if (manifest.renderer !== undefined) {
        result.renderer = await resolveEntry(this.#root, dir, manifest.renderer, 'renderer')
      }
      if (result.main && this.#entryOf(manifest.id)?.enabled) {
        try {
          result.mainHash = (await vault.read(result.main.path)).hash
        } catch (error) {
          throw new Error(`cannot read main entry "${manifest.main}": ${errorMessage(error)}`)
        }
      }
    } catch (error) {
      result.error = errorMessage(error)
    }
    return result
  }
}
