# Diabase Architecture

Diabase is a **desktop-only** (Electron), Markdown-native knowledge base. Every capability — including
the vault, editor, layout and the AI agent — is a Cordis plugin. The UI is a data-driven tree of
runtime slots hosting Blocks, and a Generative UI agent composes, subsets, or writes Blocks and
hot-mounts them live, with all state persisted as Markdown in the user's vault.

Decision records: `docs/noteriv-audit.md` (what we took from Noteriv and why the Noteriv plugin
system was replaced). Contracts: `packages/protocol` (single source of truth — read it).

## 1. Process topology

```
Electron main (Node) ── Cordis root context "main"
  plugin-vault   plugin-index   plugin-search   plugin-bundler (native esbuild)
  plugin-llm     plugin-genui (agent)           kernel: plugin loader, IPC bridge (main side)
        ▲   MessagePort RPC (structured clone): service calls both ways + event forwarding
        ▼
preload (contextIsolation, sandbox) ── exposes only the RPC port
        ▼
Electron renderer ── Cordis root context "renderer"
  kernel: IPC bridge (renderer side) → proxy services ctx.vault / ctx.index / ctx.search /
          ctx.bundler / ctx.genui (Remote<T>: every method async)
  plugin-slots (ctx.slots)   plugin-blocks (ctx.blocks)   plugin-hot (ctx.hot)
  plugin-editor  plugin-files  plugin-data-blocks  plugin-genui (panel)
```

- **Service bridge is bidirectional.** Main-side services are proxied into the renderer; the
  renderer's data methods of `slots`, `blocks`, `hot` are proxied into main so the GenUI agent can
  read catalogs and apply layouts/mounts. Functions/components never cross the bridge.
- **Events** listed in `DiabaseEvents` as `[main→renderer]` are forwarded by the bridge and emitted on
  the renderer context, so renderer plugins just `ctx.on('vault/changed', …)` (auto-disposed).
- **Proxy lifecycle:** a renderer proxy service is provided only while the bridge is connected *and*
  the main-side service exists; if the main plugin is unloaded, the proxy is withdrawn and Cordis
  disposes dependents (they re-apply when it returns). This is what makes main-side hot reload safe.
- Generated/authored code runs **only in the renderer**, and only touches the vault through
  `ctx.vault` (path-contained to the vault root by main). Main-half plugins come only from installed
  packages, never from the agent.

## 2. Kernel — Cordis

**Package:** `cordis@4.0.0-rc.12`, pinned exactly, imported **only** by `packages/kernel/src/index.ts`
(everything else imports `@diabase/kernel`). Rationale: `@cordisjs/core` is a dead line (3.18.1 is v3 API
with sync-only effects; its 4.0 betas were abandoned mid-2025); v4 now ships as the single `cordis`
package. DeepSeek Harness vendors rc.7 + 24 patches as `@deepseek-ai/cordis` — coupled to DSH, lags
upstream. If rc churn hurts we vendor the ~1,900-line core (MIT) behind the same kernel module.
**Never install `cordis@next`** (it still points at the stale 4.0.0-beta.5).

Semantics we rely on (pinned by `packages/kernel/test/lifecycle.test.ts`):
- `ctx.plugin(p)` returns a `Fiber` (awaitable; `fiber.dispose()`, `fiber.update(config)`).
- `ctx.effect(() => disposer)` — sync or async, generators allowed; `ctx.on`, `ctx.plugin`, `ctx.provide`
  are effects and are undone on dispose. **Async disposers run concurrently** — put ordered teardown in
  a single disposer.
- Services: `class X extends Service { constructor(ctx) { super(ctx, 'x') } }`, async startup in
  `[Service.init]()`. `inject: ['x']` is **required**-only in v4; optional deps use `ctx.get('x')` or a
  nested `ctx.inject(['x'], cb)`. Reading an un-injected service throws.
- When a provider leaves, dependents are disposed and go PENDING; when it returns they re-apply.
  A missing service = silent PENDING → the kernel ships an inspector early.
- Hot swap = `ctx.registry.delete(oldPlugin)` then `parent.plugin(newPlugin, config)`.
- Plugin `Config` is a Standard Schema (we use zod), validated synchronously.
- Don't use `internal/*` events, `fiber.committed`, or other internals (changed in rc.11/rc.12).

**Kernel package scope (`@diabase/kernel`):**
- Typing: augments Cordis `Context` with protocol services and `Events` with `DiabaseEvents`.
- `Remote<T>` + **IPC service bridge** (MessagePort RPC, structured clone): expose a service by name
  from either side; the other side gets a proxy service provided only while connected and while the
  origin service exists (so dependents restart correctly across processes). Event forwarding for
  `[main→renderer]` events. Errors cross as `{name, code, message}` (e.g. `VaultError`).
- **Plugin loader**: reads `.diabase/config.yml` + `diabase.plugin.json` manifests, loads/unloads
  installed plugins into the right context, and re-plugs on config change.
- **Inspector** (`ctx.inspector`): fibers tree with state, pending/missing injects, services, events —
  used by dev tools now and as an agent tool later (DSH's `cordis_inspect_*` equivalent).
- Effect helpers for renderer plugins: `domListener`, `interval`, `mountReact(el, node)` returning disposers.

## 3. Plugin catalog and ownership

| Package | Side | Provides / does | Team |
|---|---|---|---|
| `packages/protocol` `@diabase/protocol` | both | Contracts: service interfaces, `DiabaseEvents`, zod schemas | **orchestrator** (changes by request) |
| `packages/kernel` `@diabase/kernel` | both | Cordis re-export + typing, IPC bridge, plugin loader, DOM/React effect helpers | kernel |
| `apps/desktop` `@diabase/desktop` | both | Electron shell (electron-vite), boots both contexts, window, menu | kernel |
| `packages/markdown` `@diabase/markdown` | both | Pure: round-trip frontmatter (`yaml` Document), wikilinks, tags, headings, tasks | vault |
| `plugins/vault` | main | `ctx.vault` — guarded atomic IO, `updateFrontmatter`, `@parcel/watcher`, path containment, trash | vault |
| `plugins/index` | main | `ctx.index` — incremental `NoteRecord` index, backlinks, `query()`, `schema()` | vault |
| `plugins/search` | main | `ctx.search` — MiniSearch BM25 + fuzzy quick-open | vault |
| `plugins/files` | renderer | Blocks `files/tree`, `files/quick-open`, `files/search`, `files/backlinks`, `files/tags` | vault |
| `plugins/editor` | renderer | Block `core/editor` (CM6, ported from Noteriv), fence-embedded blocks | editor |
| `packages/ui` `@diabase/ui` | renderer | React primitives + theme tokens (CSS variables) used by all blocks | ui |
| `plugins/slots` | renderer | `ctx.slots` — workspace tree, renderer, per-slot error boundaries, persistence, chrome outlets | ui |
| `plugins/blocks` | renderer | `ctx.blocks` — registry, subset/compose resolution, SDK hooks (`useCtx`, `useNote`, `useQuery`) | ui |
| `plugins/data-blocks` | renderer | `core/table`, `core/list`, `core/cards`, `core/stat`, `core/chart`, `core/properties`, `core/markdown` | ui |
| `plugins/bundler` | main | `ctx.bundler` — esbuild build of vault block dirs / in-memory drafts | live |
| `plugins/hot` | renderer | `ctx.hot` — shared-module host, blob-URL import, dispose → remount, rollback | live |
| `packages/sdk` `@diabase/sdk` | renderer | The only import surface for authored blocks (re-exports blocks hooks, ui, protocol types) | live |
| `plugins/llm` | main | `ctx.llm` — provider-agnostic messages + tools; Anthropic provider default | genui |
| `plugins/genui` | main + renderer | `ctx.genui` — planner + subagents; renderer panel block `genui/panel` | genui |

## 4. Vault layout

```
<vault>/
  **/*.md                          user notes (the data)
  .diabase/
    config.yml                     enabled plugins + per-plugin config
    plugins/<id>/                  installed plugins (diabase.plugin.json + built entries)
    blocks/<ns>/<name>/block.md    persisted block manifest (frontmatter = BlockManifest, body = docs for AI)
    blocks/<ns>/<name>/index.tsx   …plus sources, for origin "source"
    workspaces/<name>.md           saved workspace (frontmatter: `diabase: workspace`, `layout: <Workspace>`)
    trash/                         deleted files
    cache/                         build cache (gitignored, safe to delete)
```

Everything a user or the agent creates is a readable, diffable Markdown/TSX file in the vault.

## 5. Blocks

- **Instance** (`BlockInstance`): `{ id, type, props, parts?, bind? }` mounted in a `slot` leaf of the
  workspace tree. Props persist in the workspace file; *data* persists in notes (frontmatter/body).
- **Manifest** (`BlockManifest`): serializable description incl. props JSON Schema, named `parts`, data
  contract (`note`/`query`/`writes`), preferred regions, and `origin`:
  `builtin` | `derived` (subset) | `composite` (compose) | `source` (authored TSX).
- **Subset** = derived manifest: `extends` + `defaults` + `parts` selector + `lockedProps`. No code.
- **Compose** = composite manifest whose body is a `LayoutNode` subtree of other blocks. No code.
- **Author** = TSX in `.diabase/blocks/<ns>/<name>/` importing only shared modules
  (`react`, `react/jsx-runtime`, `@diabase/sdk`), compiled by `ctx.bundler`, mounted by `ctx.hot`.
- Blocks read/write Markdown only through SDK hooks backed by `ctx.vault`/`ctx.index`
  (`useNote(path)`, `useQuery(q)`, `useFrontmatter(path)`), which re-render on `index/updated`.
- Blocks can be embedded in notes: a ```` ```block ```` fence containing a YAML `BlockInstance`.

## 6. Live pipeline (Creator-mode equivalent)

`block.md + index.tsx` → `ctx.bundler.build()` → `ctx.hot.install()` → dispose previous plugin fiber
(Cordis disposes all its effects: block registrations, listeners, DOM) → evaluate new bundle →
`ctx.plugin(newModule)` → slots re-render the affected instances inside a per-slot error boundary.
Workspace state and other slots are untouched. On build or runtime error the previous good bundle
stays (or is rolled back) and diagnostics are returned.

**Bundle format (adapted from DSH's module table; not import maps, not blob-URL ESM):** esbuild
`format: 'cjs'`, `platform: 'browser'`, `bundle: true`, `write: false`, `external: SHARED_MODULES`, output
wrapped as `__diabase_modules__.load({ id, hash, factory: (require, module, exports) => { … } })`.
The renderer resolves `require` from a **frozen host module table** (exactly one React and one Cordis
instance); unknown bare imports are build errors. Delivered as a classic `<script src="blob:…">` so the
renderer CSP needs `script-src 'self' blob:` but not `'unsafe-eval'`. Swap sequence: generation counter
+ per-id queue → build → await old fiber dispose → remove owned CSS → evaluate → plugin.

**Security posture:** authored code is not sandboxed from the renderer. Mitigations: renderer has no
Node (`sandbox`, `contextIsolation`), vault access is path-contained in main, renderer CSP
`connect-src 'self'` blocks exfiltration (LLM traffic goes through main), and the agent's authored
code requires user approval before first mount. Sandboxed-iframe isolation is a later option.

## 7. GenUI agent

`ctx.genui.run({ prompt })` in main: gather context (`index.schema()`, `blocks.list()`,
`slots.catalog()`) → planner produces `GenUIPlan` (items with strategy compose/subset/reuse/author)
→ subagents in parallel: layout agent (emits `LayoutOp[]`), block agents (subset/compose specs or
TSX → build → fix loop) → apply (persist blocks + workspace in vault, hot-mount, apply ops) →
verify (mount status, error boundaries, optional `webContents.capturePage` visual check).
Every run records touched files so it can be reverted. Progress streams as `genui/event`.

## 8. Phases

1. **Backend (now):** kernel (typing, IPC bridge, loader, inspector) + minimal Electron shell; vault,
   markdown, index, search; bundler. Exit criteria: a real Electron app opens a vault, the renderer
   context reaches `ctx.vault`/`ctx.index`/`ctx.search`/`ctx.bundler` through the bridge, external
   file edits flow as `vault/changed` → `index/updated`, and a vault block dir compiles to a bundle.
2. **Frontend:** `@diabase/ui`, slots, blocks, data blocks, editor block, files blocks, hot loader + SDK.
3. **GenUI:** llm provider, agent orchestrator, panel.

Slot contributions (phase 2) adapt DSH's registry: typed `SlotMap` via declaration merging; kinds
`single | list | keyed | chain`; `priority` shadowing per cell (lowest renders); `register` is a
`ctx.effect`; `useSyncExternalStore` outlets; per-entry error boundary that abdicates to the next
entry; generated slot catalog + `snapshot()`. DSH's outer frame is hardcoded — ours is the data-driven
`Workspace` tree with a pure, undoable `applyOps` engine.

## 9. Engineering conventions

- TypeScript (TS 7), ESM, `.ts` extensions in relative imports, no build step for workspace packages
  (exports point at `src/`); apps are bundled by electron-vite, runtime plugins by esbuild.
- `npm run typecheck` (single root `tsc --noEmit`) and `npm test` (Vitest; DOM tests use
  `// @vitest-environment happy-dom`) must pass before every commit to a team branch.
- Plugins never import each other's internals — only `@diabase/protocol` contracts, the kernel, and
  services via `inject`. A plugin must be fully disposable: after `fiber.dispose()` no listeners,
  timers, DOM nodes, or registrations remain (test this).
- Renderer plugins must work with any number of instances (no module-level singletons/caches keyed to
  "the" editor/view).
- Ported Noteriv files carry `// Ported from Noteriv <path> (MIT, (c) 2026 Jace) — adapted for Diabase.`
- Dependencies: prefer what's already in the root lockfile; adding a dep is fine but on
  `package-lock.json` merge conflicts take the incoming side and re-run `npm install`.
