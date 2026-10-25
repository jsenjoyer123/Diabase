// The build pipeline behind `ctx.bundler` (README §1, §7): snapshot -> hash -> cache / coalescing ->
// esbuild -> validation hook -> assembly. A plain class (no Cordis `this` tricks); `index.ts` wraps it.
import * as esbuild from 'esbuild'
import { SHARED_MODULES, type BuildInput, type BuildResult, type Diagnostic } from '@diabase/protocol'
import { BuildAbort, type AbortReason } from './abort.ts'
import { LruCache } from './cache.ts'
import { compile } from './compile.ts'
import type { BundlerConfig } from './config.ts'
import { diagnostic, failure } from './diagnostics.ts'
import { computeHash } from './hash.ts'
import {
  normalizeInput,
  snapshotDir,
  snapshotDraft,
  type Snapshot,
  type SnapshotLimits,
  type VaultReader,
} from './snapshot.ts'

/**
 * Mirrors `ValidateOptions` / `ValidateInput` of `./validate.ts` (bundle validation, README §10).
 * TODO(validate): replace these two interfaces with imports from `./validate.ts` once it lands.
 */
interface ValidateOptions {
  maxBundleBytes: number
  maxCssBytes: number
  allowDynamicCode: boolean
  sharedModules: readonly string[]
  expect?: { id: string; hash: string }
}
interface ValidateInput {
  /** Wrapper output, without `sourceURL` / `sourceMappingURL` comments. */
  code: string
  /** Stylesheet without a sourcemap comment. */
  css?: string
  /** JSON v3 sourcemap of `code`, sources already rewritten. */
  map?: string
}

export interface BuilderDeps {
  /** The vault service, read lazily at build time (dir builds only). */
  vault(): VaultReader
  /** Unexpected (non-source) failures, logged by the host; the build result carries a generic message. */
  onInternalError(error: unknown): void
}

/** Counters for tests and diagnostics; not part of `BundlerService`. */
export interface BuilderStats {
  /** `build()` calls. */
  builds: number
  /** esbuild runs started. */
  compiles: number
  /** Results served from the LRU cache. */
  cacheHits: number
  /** Builds that joined an in-flight build of the same hash. */
  coalesced: number
}

interface Outcome {
  result: BuildResult
  /** Set when the result must not be cached or shared with unrelated callers. */
  transient?: AbortReason | 'internal'
}

class Run {
  readonly controller = new AbortController()
  /** Resolves with the reason once the run is aborted (timeout or teardown). */
  readonly aborted: Promise<AbortReason>
  #timer: ReturnType<typeof setTimeout>

  constructor(timeoutMs: number) {
    this.aborted = new Promise((resolve) => {
      this.controller.signal.addEventListener(
        'abort',
        () => resolve((this.controller.signal.reason as BuildAbort).reason),
        { once: true },
      )
    })
    this.#timer = setTimeout(() => this.abort('timeout'), timeoutMs)
  }

  get signal(): AbortSignal {
    return this.controller.signal
  }

  abort(reason: AbortReason): void {
    if (!this.controller.signal.aborted) this.controller.abort(new BuildAbort(reason))
  }

  finish(): void {
    clearTimeout(this.#timer)
  }
}

const SOURCE_URL_PREFIX = 'diabase://bundles/'
const JSON_MAP_PREFIX = 'data:application/json;base64,'

function base64(text: string): string {
  return Buffer.from(text, 'utf8').toString('base64')
}

export class Builder {
  readonly stats: BuilderStats = { builds: 0, compiles: 0, cacheHits: 0, coalesced: 0 }
  readonly #config: BundlerConfig
  readonly #deps: BuilderDeps
  readonly #cache: LruCache<BuildResult>
  readonly #inflight = new Map<string, Promise<Outcome>>()
  readonly #runs = new Set<Run>()
  readonly #compiles = new Set<Promise<Outcome>>()
  readonly #shared: ReadonlySet<string> = new Set(SHARED_MODULES)
  readonly #limits: SnapshotLimits
  #disposal: Promise<void> | undefined

  constructor(config: BundlerConfig, deps: BuilderDeps) {
    this.#config = config
    this.#deps = deps
    this.#cache = new LruCache(config.cacheSize)
    this.#limits = {
      maxFiles: config.maxFiles,
      maxFileBytes: config.maxFileBytes,
      maxInputBytes: config.maxInputBytes,
    }
  }

  get stopped(): boolean {
    return this.#disposal !== undefined
  }

  async build(input: BuildInput): Promise<BuildResult> {
    this.stats.builds++
    if (this.stopped) return this.#abortResult('stopped')
    const run = new Run(this.#config.timeout)
    this.#runs.add(run)
    try {
      const work = this.#execute(input, run).catch((error: unknown): BuildResult => {
        if (error instanceof BuildAbort) return this.#abortResult(error.reason)
        this.#deps.onInternalError(error)
        return this.#internalFailure()
      })
      // Settle as soon as the run is aborted; `work` unwinds in the background (its esbuild
      // context is disposed by the compile step and awaited by `dispose()`).
      const result = await Promise.race([work, run.aborted.then((reason) => this.#abortResult(reason))])
      return structuredClone(result)
    } finally {
      run.finish()
      this.#runs.delete(run)
    }
  }

  /**
   * Ordered teardown: stop accepting builds, abort every run (which cancels its esbuild context and
   * settles the build as "stopped"), wait until all contexts are disposed, drop the cache.
   */
  dispose(): Promise<void> {
    this.#disposal ??= (async () => {
      for (const run of this.#runs) run.abort('stopped')
      await Promise.allSettled([...this.#compiles])
      this.#inflight.clear()
      this.#cache.clear()
    })()
    return this.#disposal
  }

  // --- pipeline ------------------------------------------------------------------------------

  async #execute(input: BuildInput, run: Run): Promise<BuildResult> {
    const normalized = normalizeInput(input)
    if (!normalized.ok) return failure(normalized.errors)
    const value = normalized.value
    const snapshot =
      value.kind === 'draft'
        ? snapshotDraft(value, this.#limits)
        : await snapshotDir(this.#deps.vault(), value, this.#limits, run.signal)
    if (!snapshot.ok) return failure(snapshot.errors)

    const hash = computeHash(snapshot.snapshot, this.#config, esbuild.version)
    for (;;) {
      run.signal.throwIfAborted()
      const cached = this.#cache.get(hash)
      if (cached) {
        this.stats.cacheHits++
        return cached
      }
      const flight = this.#inflight.get(hash)
      if (!flight) return (await this.#lead(snapshot.snapshot, hash, run)).result
      this.stats.coalesced++
      const outcome = await flight
      // The leader ran out of time but this caller has not: take over.
      if (outcome.transient === 'timeout') continue
      return outcome.result
    }
  }

  #lead(snapshot: Snapshot, hash: string, run: Run): Promise<Outcome> {
    const promise = this.#compileOutcome(snapshot, hash, run.signal)
    this.#inflight.set(hash, promise)
    this.#compiles.add(promise)
    const cleanup = () => {
      if (this.#inflight.get(hash) === promise) this.#inflight.delete(hash)
      this.#compiles.delete(promise)
    }
    promise.then(cleanup, cleanup)
    return promise
  }

  async #compileOutcome(snapshot: Snapshot, hash: string, signal: AbortSignal): Promise<Outcome> {
    this.stats.compiles++
    try {
      const output = await compile(snapshot, hash, this.#shared, signal)
      const result = this.#assemble(snapshot, hash, output)
      if (!this.stopped) this.#cache.set(hash, result)
      return { result }
    } catch (error) {
      if (error instanceof BuildAbort) return { result: this.#abortResult(error.reason), transient: error.reason }
      this.#deps.onInternalError(error)
      return { result: this.#internalFailure(), transient: 'internal' }
    }
  }

  #assemble(snapshot: Snapshot, hash: string, output: Awaited<ReturnType<typeof compile>>): BuildResult {
    if (output.errors.length > 0 || output.js === undefined) return failure(output.errors, output.warnings)

    const input: ValidateInput = { code: output.js }
    if (output.css !== undefined) input.css = output.css
    if (output.jsMap !== undefined) input.map = output.jsMap
    const validation = this.runValidation(input, {
      maxBundleBytes: this.#config.maxBundleBytes,
      maxCssBytes: this.#config.maxCssBytes,
      allowDynamicCode: this.#config.allowDynamicCode,
      sharedModules: SHARED_MODULES,
      expect: { id: snapshot.id, hash },
    })
    const warnings = [...output.warnings, ...validation.warnings]
    if (validation.errors.length > 0) return failure(validation.errors, warnings)

    const sourcemap = this.#config.sourcemap
    let code = `${output.js}//# sourceURL=${SOURCE_URL_PREFIX}${hash}.js\n`
    if (sourcemap && output.jsMap !== undefined) {
      code += `//# sourceMappingURL=${JSON_MAP_PREFIX}${base64(output.jsMap)}\n`
    }
    const result: BuildResult = { ok: true, code, hash, warnings }
    if (output.css !== undefined) {
      let css = output.css.endsWith('\n') ? output.css : `${output.css}\n`
      if (sourcemap && output.cssMap !== undefined) {
        css += `/*# sourceMappingURL=${JSON_MAP_PREFIX}${base64(output.cssMap)} */\n`
      }
      result.css = css
    }
    return result
  }

  /** The bundle validation hook (README §10), called with exactly the final wrapper output. */
  private runValidation(
    _input: ValidateInput,
    _options: ValidateOptions,
  ): { errors: Diagnostic[]; warnings: Diagnostic[] } {
    // TODO(validate): return validateBundle(input, options) from './validate.ts'.
    return { errors: [], warnings: [] }
  }

  #abortResult(reason: AbortReason): BuildResult {
    const text = reason === 'timeout' ? `Build timed out after ${this.#config.timeout}ms` : 'Bundler stopped'
    return failure([diagnostic(text)])
  }

  #internalFailure(): BuildResult {
    return failure([diagnostic('Internal bundler error. See the application log for details.')])
  }
}
