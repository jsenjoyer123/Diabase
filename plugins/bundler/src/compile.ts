// One esbuild run over a snapshot (README §4/§5): options, diagnostics, source maps, CSS.
import * as esbuild from 'esbuild'
import type { Diagnostic } from '@diabase/protocol'
import { BUNDLE_GLOBAL } from '@diabase/protocol'
import { BUNDLE_TARGET } from './config.ts'
import { diagnostic, mapMessage } from './diagnostics.ts'
import { rewriteSourceMap } from './sourcemap.ts'
import { createVfs, NAMESPACE, vfsPlugin, type Vfs } from './vfs.ts'
import type { Snapshot } from './snapshot.ts'

export interface CompileOutput {
  errors: Diagnostic[]
  warnings: Diagnostic[]
  /** Wrapper output (no `sourceURL` / `sourceMappingURL` comments). Present when `errors` is empty. */
  js?: string
  /** Decoded source map of `js` (JSON, sources already rewritten). */
  jsMap?: string
  /** Bundled stylesheet without a sourcemap comment; absent when no CSS was imported. */
  css?: string
  cssMap?: string
}

export const WRAPPER_FOOTER = '} });'

/** First lines of every bundle: the registration call opens the factory, `"use strict"` restores ESM strictness. */
export function wrapperBanner(id: string, hash: string): string {
  return `${BUNDLE_GLOBAL}.load({ id: ${JSON.stringify(id)}, hash: ${JSON.stringify(hash)}, factory: function (require, module, exports) {\n"use strict";`
}

const NO_DEFAULT_EXPORT =
  "has no default export. Export the block's Cordis plugin: export default { name, apply(ctx) { … } } (or a function or class)."

function mapErrors(messages: esbuild.Message[], vfs: Vfs): Diagnostic[] {
  return messages.map((message) => {
    // The virtual entry re-exports `default`; esbuild reports a missing one at the stub.
    if (
      message.location?.file === vfs.entryStubFile &&
      /^No matching export in .* for import "default"$/.test(message.text)
    ) {
      return diagnostic(`Block entry '${vfs.snapshot.entry}' ${NO_DEFAULT_EXPORT}`, { file: vfs.entryFile })
    }
    return mapMessage(message, vfs.mapper)
  })
}

function outputByName(files: esbuild.OutputFile[], name: string): esbuild.OutputFile | undefined {
  return files.find((f) => f.path.endsWith(`/${name}`) || f.path.endsWith(`\\${name}`))
}

function sourceRootFor(snapshot: Snapshot): string {
  return snapshot.kind === 'dir' ? 'diabase://vault/' : 'diabase://draft/'
}

/** `/* diabase-vfs:path *\/` header comments esbuild puts above each CSS input -> display paths. */
function scrubCssComments(css: string, vfs: Vfs): string {
  return css.replace(/^\/\* (.*) \*\/$/gm, (whole, text: string) => {
    const file = vfs.mapper.fileOf(text)
    return file === undefined ? whole : `/* ${file.split('*/').join('*\\/')} */`
  })
}

/** `// diabase-vfs:path` header comments esbuild puts above each module in the JS output. */
function scrubJsComments(js: string, vfs: Vfs): string {
  return js.replace(/^\/\/ (.*)$/gm, (whole, text: string) => {
    if (text === vfs.entryStubFile) return '// (bundle entry)'
    const file = vfs.mapper.fileOf(text)
    return file === undefined ? whole : `// ${file}`
  })
}

function rewriteMap(json: string, vfs: Vfs): string {
  return rewriteSourceMap(json, {
    mapSource: (source) => (source.startsWith(`${NAMESPACE}:`) ? (vfs.mapper.fileOf(source) ?? null) : null),
    sourceRoot: sourceRootFor(vfs.snapshot),
  })
}

function isBuildFailure(error: unknown): error is esbuild.BuildFailure {
  return (
    typeof error === 'object' &&
    error !== null &&
    Array.isArray((error as { errors?: unknown }).errors) &&
    (error as { errors: unknown[] }).errors.length > 0
  )
}

/**
 * Runs esbuild once. Rejects with `signal.reason` when aborted; resolves with diagnostics for
 * every problem in the sources. The esbuild context is always disposed before returning.
 */
export async function compile(
  snapshot: Snapshot,
  hash: string,
  shared: ReadonlySet<string>,
  signal: AbortSignal,
): Promise<CompileOutput> {
  signal.throwIfAborted()
  const vfs = createVfs(snapshot, hash, shared)

  const context = await esbuild.context({
    entryPoints: [{ in: 'entry', out: 'bundle' }],
    outdir: 'out',
    bundle: true,
    write: false,
    logLevel: 'silent',
    format: 'cjs',
    platform: 'browser',
    target: BUNDLE_TARGET,
    jsx: 'automatic',
    jsxImportSource: 'react',
    jsxDev: false,
    define: { 'process.env.NODE_ENV': '"production"' },
    minify: false,
    treeShaking: true,
    legalComments: 'inline',
    sourcemap: 'external',
    sourcesContent: true,
    tsconfigRaw: {
      compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react', useDefineForClassFields: true },
    },
    banner: { js: wrapperBanner(snapshot.id, hash) },
    footer: { js: WRAPPER_FOOTER },
    plugins: [vfsPlugin(vfs)],
  })

  try {
    signal.throwIfAborted()
    const onAbort = () => {
      // Resolves once the running build notices; never awaited so the caller can settle right away.
      context.cancel().catch(() => {})
    }
    signal.addEventListener('abort', onAbort, { once: true })
    let result: esbuild.BuildResult
    try {
      result = await context.rebuild()
    } catch (error) {
      signal.throwIfAborted()
      if (!isBuildFailure(error)) throw error
      return {
        errors: mapErrors(error.errors, vfs),
        warnings: error.warnings.map((m) => mapMessage(m, vfs.mapper)),
      }
    } finally {
      signal.removeEventListener('abort', onAbort)
    }
    signal.throwIfAborted()

    const warnings = result.warnings.map((m) => mapMessage(m, vfs.mapper))
    const files = result.outputFiles ?? []
    const js = outputByName(files, 'bundle.js')
    const jsMap = outputByName(files, 'bundle.js.map')
    if (!js || !jsMap) throw new Error('esbuild produced no JavaScript output')
    const css = outputByName(files, 'bundle.css')
    const cssMap = outputByName(files, 'bundle.css.map')

    const output: CompileOutput = {
      errors: [],
      warnings,
      js: scrubJsComments(js.text.endsWith('\n') ? js.text : `${js.text}\n`, vfs),
      jsMap: rewriteMap(jsMap.text, vfs),
    }
    if (css && css.text.trim() !== '') {
      output.css = scrubCssComments(css.text, vfs)
      if (cssMap) output.cssMap = rewriteMap(cssMap.text, vfs)
    }
    return output
  } finally {
    await context.dispose().catch(() => {})
  }
}
