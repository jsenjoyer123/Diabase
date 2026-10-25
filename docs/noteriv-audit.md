# Noteriv Audit — what Diabase keeps, upgrades, and drops

Source: `~/Projects/Noteriv` @ `8ed897f` (v2.4.6, MIT, © 2026 Jace). Desktop app is
Next.js 16 + Tauri 2 (Rust) + React 19 + CodeMirror 6. Any file ported from Noteriv
must keep attribution (see `NOTICE`), and the port must be noted in the commit message.

## 1. Plugin system (`desktop/src/lib/plugin-api.ts`) — **REPLACED by Cordis**

Noteriv's plugin system is an Obsidian-style extension API, not a kernel:

| Concern | Noteriv | Verdict |
|---|---|---|
| Lifecycle | `onLoad(api)` / `onUnload()` on a flat map of plugins | No nested scopes, no reversible effects |
| Cleanup | Prefix-matching (`"<pluginId>:"`) over 4 registries + event map | Brittle; `render()` disposers for sidebar panels/settings tabs are **never invoked** |
| Services / DI | None. One fixed `PluginAPI` object; plugins cannot provide services to each other | Fails "everything is a plugin" |
| Core features | Hard-coded in a 2588-line `app/page.tsx`; nothing core is a plugin | Monolith |
| Host wiring | `getSidebarPanels`, `getSettingsTabs`, `getCommands`, `setNoticeHandler` have **no consumers** — only status-bar items and code-block processors reach the UI | Half the API is dead |
| Reload | `loadAllEnabled()` runs at `page.tsx:503` **and** `page.tsx:553` without unloading → `onLoad` runs twice, duplicate handlers | Leak |
| Isolation | `new Function(code)` — comment says "sandboxed", it is not (full `window`) | Misleading |
| Editor API | Assumes one global editor (`getEditorState()` closure over a single `editorViewRef`) | Incompatible with multi-slot blocks |
| `app.currentFile` | Captured once at API creation → stale | Bug |

**Decision:** do not build on it. Diabase's kernel is Cordis (see `docs/architecture.md` §2), which
natively provides reversible effects, service injection with dependency-driven restart, nested
fibers/scopes, and clean disposal.

**Ideas kept from Noteriv:**
- Vault-local plugin directory (`<vault>/.diabase/plugins/<id>/`) + manifest + enabled-list config.
- Static manifest declarations of what a plugin contributes (Noteriv's `codeBlockLanguages`, read by
  mobile to lazy-load plugins) → generalized as `manifest.contributes` (blocks, slots, fences) so the
  host and the GenUI agent can discover capabilities *without executing plugin code*.
- Fenced code-block processor registry (`markdown-code-block-registry.ts`) → generalized into
  "blocks embedded in Markdown" (```` ```block ```` fences rendered through the Block Registry).
- `examples/plugins/chessboard` is a useful fixture for the fence-embedding path.

## 2. Vault / FS / index / search — **REWRITE core, PORT helpers**

Noteriv's TS side calls a Tauri shim (`window.electronAPI.*`, injected JS from `shim.rs`) inline from
components. There is **no index** (backlinks, tags, dataview rescan the whole vault over IPC on every
render), the frontmatter parser is hand-rolled with four disagreeing copies, and it is not
round-trip safe (editing one key destroys block lists and comments).

**Port nearly as-is (pure TS, with fixes):**
- `lib/knowledge/path-safety.ts` (relative-path validation) + the Rust `scope.rs` `resolve()` algorithm
  (canonicalize longest existing prefix, walk `..`, refuse symlink escapes) → reimplement with `realpath`.
- The `sha256-<hex>` base-hash guarded-write contract (`knowledge-service.ts:76`, `commands_fs.rs:150-194`)
  → **every** Diabase write is optimistic-concurrency checked and atomic (tmp + rename).
- `knowledge/related-notes.ts`, `tag-utils.parseTags` (strip frontmatter first, add frontmatter tags,
  support nested `a/b` tags), `parseWikiLink`, `template-utils`, `toc-utils` (fix duplicate-slug key,
  non-ASCII slugs), `vault-insights-utils` (point at the index).

**Rewrite:**
- Frontmatter → `yaml` package `parseDocument` / `doc.setIn` / `String(doc)`: single parser,
  preserves comments, ordering, and untouched keys.
- Link/tag/metadata index → per-file extractor `{frontmatter, tags, outlinks, headings, tasks}`,
  in-memory with reverse map for backlinks, **incremental** on watcher events.
- Link resolution → path-aware with segment boundaries (Noteriv's suffix match resolves
  `[[folder/note]]` to `myfolder/note`).
- Query (Dataview successor) → typed values over the index (Noteriv compares everything as strings,
  folder queries never match, `created`/`modified` always empty).
- Search → MiniSearch (BM25, stable order) instead of first-200-substring-hits in readdir order.
- Watcher → `@parcel/watcher`, typed events (add/change/unlink + paired renames), self-write
  suppression via recently-written `{path, hash}` registry (Noteriv marks the user's own autosave
  echo as an external conflict, and drops *all* events for vaults under hidden dirs).

**Drop:** `shim.rs`, Tauri store/vault registry, git sync, Noteriv's MCP server code (no path guard;
useful only as a list of tools to offer later).

## 3. Editor (CodeMirror 6) — **PORT core, de-globalize**

Architecture is sound: one `liveMarkdownPlugin` ViewPlugin (`components/markdown/plugin.ts:209`) rebuilds
decorations over viewport ±50 lines, cursor lines stay raw, ordered trackers (code / math / html block),
then block renderers (first match wins) then priority-sorted inline renderers; block math is a proper
`StateField` with `block:true` widgets (`markdown/math.ts:164`). `view.destroy()` is called on unmount.

**Blockers for "mount anywhere, many instances, clean dispose":**
- Global renderer registry populated at import (`markdown/registry.ts:4-5`, `index.ts:3`).
- `renderers/images.ts:4-5` keeps a *single* module-level `EditorView` (split view writes into the wrong
  doc); import-time `setInterval(…,300)` scanning `document` forever (`:61-66`); document listeners never
  removed (`:87,126,155`); unbounded data-URL cache.
- Vault path read from the DOM (`[data-vault-path]`, `images.ts:15`, `code-blocks.ts:328`);
  `window.electronAPI` calls inline (`Editor.tsx:140-187`, `images.ts:34`, `code-blocks.ts:311-342`,
  `wikilink-completion.ts:15`).
- Wikilink / external-link clicks handled by a document-wide listener in `page.tsx:1416-1443`.
- Code-block processor cleanup stored on widget instance — likely never runs when CM keeps old DOM
  (`code-blocks.ts:457,632,640`); key cleanup by DOM element instead.
- `RenderedMarkdownWidget` has no `eq()` (`widget.ts:11`) → every inline widget rebuilt per cursor move;
  full `extractHeadings(doc.toString())` per keystroke (`plugin.ts:251`).
- Doc swaps don't use `addToHistory:false`; editor isn't keyed per file → undo crosses notes.
- **Dead code** (imported nowhere): `markdown/callouts.ts`, `embeds.ts`, `wikilinks.ts`, `tags.ts`,
  `mermaid.ts`, `slash-commands.ts`, `lib/vim-mode.ts` (the `renderers/*` versions are the live ones).

**Port nearly as-is:** `theme.ts` (→ CSS token contract), `types.ts`, `widget.ts` (+`eq`),
`renderers/` headings, horizontal-rule, blockquotes, lists, checkboxes, tables, footnotes,
definition-lists, highlight, inline, links, autolinks, tags, toc; `lib/editor-commands.ts`,
`lib/sanitize-html.ts`, the math `StateField` pattern.

**Port with adaptation:** `plugin.ts` + `registry.ts` → per-instance renderer set via a CM `Facet`;
`code-blocks.ts` → strip Mermaid/Dataview into processors, DOM-keyed cleanup, real `sourcePath`;
`markdown-code-block-registry.ts` → per-instance, generalized into embedded-Block fences;
`images.ts` → view from `toDOM(view)`, `vault.readBinary`, per-view cache, ViewPlugin `eventHandlers`;
`renderers/wikilinks.ts` + `wikilink-completion.ts` → vault file provider + click callback via `Facet`.
Merge `Editor` / `SourceEditor` / `ReadOnlyView` into one imperative
`mount(el, {vault, path, mode}) → {destroy}` with `Compartment`s for mode / readOnly / focus.

**Drop:** dead files above, `markdown-to-html.ts` (unvalidated hrefs, `:158-160`), Dataview widget,
autosave-in-`page.tsx`. **Optional plugins, not core:** mermaid, katex, vim, `@codemirror/language-data`.
