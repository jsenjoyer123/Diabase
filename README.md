# Diabase

A Markdown-native, everything-is-a-plugin desktop knowledge base with a Generative UI block engine.

- Kernel: [Cordis](https://github.com/cordiverse/cordis) v4 — every capability is a disposable plugin.
- Shell: Electron (main + renderer Cordis contexts joined by an IPC service bridge).
- Data: your vault of `.md` files; layouts, blocks and plugins are stored in the vault too.
- Lineage: a subset rewrite of [Noteriv](https://github.com/thejacedev/Noteriv) (MIT) — see `NOTICE`.

Docs: [`docs/architecture.md`](docs/architecture.md) · [`docs/noteriv-audit.md`](docs/noteriv-audit.md) ·
contracts in [`packages/protocol`](packages/protocol/src).

```sh
npm install
npm run check   # typecheck + tests
```
