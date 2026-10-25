---
title: Architecture Sketch
tags: [project/diabase, draft]
---

# Architecture Sketch

![[diagram.png|200]]

Two processes, one plugin kernel on each side, and a message port between them. Main owns the disk;
the renderer owns the pixels. Anything the agent writes runs in the renderer and only reaches files
through the vault service.

## Process topology

```text
main:     vault  index  search  bundler  llm  genui
             ▲  MessagePort RPC  ▼
renderer: slots  blocks  hot  editor  files  [[not a link in a code block]]
```

## Open questions

1. How do hot-reloaded blocks keep their state? Probably they don't; persist to notes instead.
2. Where do workspace files live? `.diabase/workspaces/*.md` for now.
3. Heading slugs for [[Diabase Roadmap#Phase 2 — Frontend (UI, Blocks & Hot-Reload)]] need a rule.

## Notes

Draft. Promote anything that survives a week into the [[Diabase Roadmap]].
