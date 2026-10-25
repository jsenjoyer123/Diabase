# @diabase/plugin-bundler

`[main]` Cordis service `ctx.bundler` (`BundlerService` in `@diabase/protocol`). Compiles runtime-authored
block plugins — TSX in the vault under `.diabase/blocks/<ns>/<name>/`, or in-memory agent drafts — into a
single classic script that the renderer's hot loader (`ctx.hot`, `plugins/hot`) evaluates against a frozen
table of shared modules.

This file is the **runtime bundle contract**: between this bundler, the phase-2 hot loader, and the code the
GenUI agent writes. Change it only together with both sides, and bump `BUNDLE_FORMAT` (part of every hash)
when the output format changes.

```
block dir / draft ──snapshot──▶ hash ──cache?──▶ esbuild (virtual FS) ──▶ validate ──▶ BuildResult
                                                                                          │ (IPC, structured clone)
renderer: <script src="blob:…"> ─▶ __diabase_modules__.load({ id, hash, factory }) ─▶ factory(require, module, exports)
          ─▶ module.exports.default ─▶ ctx.plugin(default)
```

## 1. Inputs

`build(input: BuildInput): Promise<BuildResult>` — never rejects for problems in the sources (missing files,
syntax errors, forbidden imports, limits, timeouts); those come back as `{ ok: false, errors }`.

| Input | Meaning | `id` | `Diagnostic.file` |
|---|---|---|---|
| `{ dir, entry? }` | Vault directory, `entry` relative to it, default `index.tsx` | the normalized `dir` | vault-relative path, e.g. `.diabase/blocks/user/shelf/index.tsx` |
| `{ files, entry }` | Draft sources; keys are relative POSIX paths | `draft:<entry>` | the `files` key, e.g. `index.tsx` |

**Snapshot first.** A dir build first reads the whole block directory through `ctx.vault` (`list(dir,
{ recursive: true, includeHidden: true })`, then `read`/`readBinary` per file) into an in-memory file map —
the same shape a draft provides. Everything after that (hashing, resolving, loading) works on the snapshot,
so a build sees one consistent set of files and the bundler never touches the real file system (vault path
containment applies to every read). Snapshot rules:

- Only files with a supported extension (§3) are read; other files are ignored but cannot be imported.
- Entries with a path segment starting with `.` or equal to `node_modules` are skipped.
- Limits (config, §8): `maxFiles` files, `maxFileBytes` per file, `maxInputBytes` in total. Exceeding one is
  a build error naming the limit.
- Draft keys must be normalized relative paths: no leading `/`, no `\`, no `.`/`..`/empty segments.

## 2. Resolution

All resolution happens in a virtual-FS esbuild plugin over the snapshot (custom namespace, so esbuild never
reads `tsconfig.json`/`package.json` or any file from disk).

| Import | Result |
|---|---|
| Relative (`./x`, `../x`) staying inside the block dir | Bundled. Tries the exact path, then `.tsx .ts .jsx .js .json .css`, then `<path>/index.{tsx,ts,jsx,js}`. A `.js`/`.jsx` specifier also tries `.ts`/`.tsx` (TS ESM style). |
| Relative escaping the block dir, or absolute (`/x`, `C:\x`) | Error: `Import '../x' resolves outside the block directory. Blocks can only import files inside '<dir>'.` |
| Bare specifier in `SHARED_MODULES` (static `import`/`require('…')`) | External: emitted as `require("<specifier>")`, answered by the host table. |
| Node built-in (`fs`, `node:path`, `process`, …) | Error: `Node built-in module 'fs' is not available: blocks run in the renderer without Node. Read and write vault files through @diabase/sdk.` |
| Any other bare specifier (`lodash`, `cordis`, `@diabase/kernel`, `react-dom/server`, `zod/v4`) | Error: `Package 'lodash' is not available to blocks. Available modules: react, react/jsx-runtime, react-dom, react-dom/client, zod, @diabase/protocol, @diabase/sdk.` (+ hint for `cordis`/`@diabase/kernel`: use `@diabase/sdk`) |
| URLs (`https:`, `data:`, `file:`, …) | Error: `URL imports are not supported in blocks.` |
| `import('<shared module>')` | Error: `Dynamic import() of 'react' is not supported; use a static import.` (esbuild would leave a real `import("react")` in CJS output, which the browser cannot resolve.) |
| `import('./x')` | Bundled inline (no code splitting); the call returns a resolved promise. |
| Missing relative file | Error: `Could not resolve './x' from 'index.tsx': no such file in the block directory.` |

Type-only imports (`import type`, unused imports) are erased by the TS loader before resolution, so
`import type { Context } from '@diabase/kernel'` costs nothing and is not an error.

## 3. Loaders

| Extension | esbuild loader | Notes |
|---|---|---|
| `.tsx` `.ts` | `tsx` / `ts` | Type-stripping only; no type checking. |
| `.jsx` `.js` | `jsx` | `.js` accepts JSX too (generated code often does this). |
| `.json` | `json` | |
| `.css` | `css` | Global stylesheet, collected into `BuildResult.css`. |
| `.module.css` | `local-css` | Exports `{ className: generatedName }`. Generated names carry a per-input salt so two blocks' `card.module.css` never collide. Prefer this for block styles. |
| `.md` `.txt` | `text` | Default export is the file content (string). |
| `.svg` `.png` `.jpg` `.jpeg` `.gif` `.webp` | `dataurl` | Inlined as `data:` URLs (counts against the bundle size limit). |

Any other extension imported from code is an error: `Unsupported file type '.yaml' ('./data.yaml').`

## 4. esbuild options

```ts
{
  bundle: true, write: false, metafile: true, logLevel: 'silent',
  format: 'cjs', platform: 'browser',
  target: BUNDLE_TARGET,               // 'chrome154' = Electron 45's Chromium; bump with Electron
  jsx: 'automatic', jsxImportSource: 'react', jsxDev: false,
  define: { 'process.env.NODE_ENV': '"production"' },
  minify: false, treeShaking: true,    // readable output for the agent and devtools
  sourcemap: 'external', sourcesContent: true,   // inlined after validation, see §5
  tsconfigRaw: { compilerOptions: { jsx: 'react-jsx', jsxImportSource: 'react', useDefineForClassFields: true } },
  entryPoints: [<virtual entry>], outdir: <virtual>,
  banner/footer: the factory wrapper (§5),
}
```

The real entry point is a virtual module `export { default } from "./<entry>"`. Only the entry's default
export reaches the bundle, and a missing default export is a **build error**:
`Block entry 'index.tsx' has no default export. Export the block's Cordis plugin: export default { name, apply(ctx) { … } } (or a function or class).`

## 5. Output format

`BuildResult.code` is exactly:

```js
__diabase_modules__.load({ id: "<id>", hash: "<hash>", factory: function (require, module, exports) {
"use strict";
/* esbuild CJS output: helpers, then `module.exports = __toCommonJS(entry_exports)`;
   shared modules are read with require("react") etc. */
} });
//# sourceURL=diabase://bundles/<hash>.js
//# sourceMappingURL=data:application/json;base64,<map>
```

- One top-level statement: a call to the global `__diabase_modules__.load` (`BUNDLE_GLOBAL`) with a
  `BundleRegistration` (`id`, `hash`, `factory`; types in `@diabase/protocol` `live.ts`). Evaluating the
  script only **registers** the factory; the host decides when to run it.
- `"use strict"` restores ESM strictness lost by the CJS conversion.
- `id`: see §1; informational (logs, devtools). The host matches registrations on `hash`.
- Sourcemap: inline (present unless config `sourcemap: false`), `sourcesContent` included, `sourceRoot`
  `diabase://vault/` (dir builds) or `diabase://draft/` (drafts), `sources` = the `Diagnostic.file` strings.
  The `sourceURL` names the blob script in devtools and stack traces.
- CSS is **not** in the script: `BuildResult.css` holds the bundled stylesheet (global `.css` and
  `.module.css`, in import order, with an inline sourcemap comment), or is absent when no CSS was imported.
  The host owns its `<style>` element (§6).
- `BuildResult.hash` = input hash (§7). Same hash ⇒ byte-identical `code`/`css`.

### Default export

The factory ends with `module.exports.default` = the entry's default export. It must be a Cordis plugin:

- an object with an `apply(ctx, config)` method (optionally `name`, `inject`, `Config`), or
- a function `(ctx, config) => void`, or a class whose constructor takes `(ctx, config)`.

The existence of a default export is checked at build time (§4); its shape is checked by the host after
evaluation (`typeof d === 'function' || typeof d?.apply === 'function'`).

## 6. Host contract (renderer, implemented by `plugins/hot` in phase 2)

1. Install a frozen `globalThis.__diabase_modules__: BundleModuleHost` once.
2. To mount a `BuildResult`: register an expectation for `result.hash`, append
   `<script src="${URL.createObjectURL(new Blob([code], { type: 'text/javascript' }))}">`, and wait for
   `load()`; then revoke the URL and remove the script element. A `load()` whose hash nobody expects is
   ignored. Script `error` events (syntax errors cannot happen after validation, but CSP can block) fail
   the mount. CSP needs `script-src 'self' blob:`; no `'unsafe-eval'`.
3. Run `factory(require, module, module.exports)` with `module = { exports: {} }` inside `try/catch`.
   A throw is a mount failure (diagnostics: map the stack through the inline sourcemap).
4. `require(specifier)` returns the module's **interop record** for `SHARED_MODULES` and throws
   `Error("Module '<specifier>' is not provided to blocks")` for anything else. Interop record =
   `Object.freeze({ __esModule: true, ...namespace, default: namespace.default ?? namespace })`, built once
   per specifier from the host's own module instance (exactly one React, one SDK). `__esModule: true`
   makes esbuild's `__toESM` helper map `import X from` to `default` and named imports to properties.
5. Plugin = `module.exports.default`; validate its shape (§5), then `ctx.plugin(plugin)`.
6. CSS: if `result.css` is present, append `<style data-diabase-hot="<hot id>">` to `<head>` before the
   plugin applies; remove it after the plugin's fiber is disposed (swap, uninstall, rollback).
7. A factory runs at most once. Re-mounting the same hash evaluates the script again.

## 7. Hashing, caching, coalescing, timeouts

- `hash = "sha256-" + hex(sha256(canonical JSON of { BUNDLE_FORMAT, esbuild.version, BUNDLE_TARGET,
  SHARED_MODULES, output-affecting config (§8, everything except timeout and cache size), id, entry,
  sorted [path, sha256(content)] of the snapshot }))`. Computed before building, embedded in the bundle.
- In-memory LRU (`cacheSize` entries) keyed by `hash`, holding successful results and deterministic
  failures. Timeouts and internal errors are never cached.
- Concurrent builds with the same hash share one in-flight build.
- Each build has `timeout` ms; on expiry the esbuild build is cancelled and the result is
  `{ ok: false, errors: [{ text: 'Build timed out after …ms' }] }`.
- Lifecycle: every esbuild context is disposed when its build settles; when the service's fiber is
  disposed, in-flight builds are cancelled and the cache is dropped, and the esbuild child process is
  stopped once the last bundler instance in the process is gone.

## 8. Config (zod, all optional)

| Key | Default | |
|---|---|---|
| `timeout` | `15000` | ms per build |
| `cacheSize` | `64` | LRU entries |
| `maxFiles` | `256` | files in a snapshot |
| `maxFileBytes` | `1 MiB` | per input file |
| `maxInputBytes` | `4 MiB` | total snapshot |
| `maxBundleBytes` | `1 MiB` | `code` without the inline sourcemap |
| `maxCssBytes` | `512 KiB` | `css` without its sourcemap |
| `sourcemap` | `true` | inline sourcemaps in `code`/`css` |
| `allowDynamicCode` | `false` | permit the dynamic-code patterns of §10 |

## 9. Diagnostics

`Diagnostic` (`@diabase/protocol`): `text`, `file` (§1), `line` (1-based), `column` (1-based, UTF-16 code
units — what editors and `tsc` show), `lineText`. esbuild notes are appended to `text` as
`\n  note: …`. Warnings are preserved on both success and failure. Messages are written for the GenUI
agent to act on: say what is wrong, what is allowed, and what to do instead. Diagnostics never contain
absolute host paths or esbuild internals (virtual namespaces are mapped back to `file`). All results are
plain data (structured-clone safe; they cross the IPC bridge).

## 10. Bundle validation

Cheap static checks on the final `code` (parsed as JS) before it is returned. Defense in depth and
early, actionable feedback for the agent — **not a sandbox** (authored code runs with the renderer's
privileges; see `docs/architecture.md` §6, Security posture). Findings are mapped back to source
positions through the sourcemap when possible.

| Check | Severity |
|---|---|
| `code` > `maxBundleBytes`, `css` > `maxCssBytes` | error |
| Program is not exactly one `__diabase_modules__.load({ id, hash, factory: function … })` statement | error |
| `__diabase_modules__` referenced inside the factory | error |
| `import(...)` left in the output (e.g. non-literal specifier) | error |
| `require(x)` with a non-literal argument or a literal outside `SHARED_MODULES` | error |
| `eval(...)`, `new Function(...)` / `Function(...)`, string-argument `setTimeout`/`setInterval`, `document.createElement('script')` | error unless `allowDynamicCode` |
