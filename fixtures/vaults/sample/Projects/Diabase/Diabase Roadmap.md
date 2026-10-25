---
title: Diabase Roadmap
aliases: [Roadmap]
status: active
started: 2026-09-01
owner: me
tags: [project, project/diabase]
---

# Diabase Roadmap

A Markdown-native knowledge base where everything is a plugin, and an agent can build the UI I ask for.
This note is the single source of truth for what happens when; the [[Overview]] explains why.

## Phase 1

Backend first: the kernel, vault, index, search and the block bundler. Exit criteria: a real window
opens this vault, external edits show up in the index within a second, and a block folder compiles. ^abc123

### Tasks

- [x] Scaffold the monorepo and contracts
- [x] Pick a plugin kernel (Cordis 4)
- [ ] Vault service with atomic writes and a trash folder
- [ ] Incremental index with backlinks
  - [ ] Wikilink resolution, including [[Work/Plan]]-style paths
  - [x] Decide on the query language (structured JSON, not strings)
- [ ] Full-text search

## Notes

Keep phase 1 boring. Every clever idea goes into [[Projects/Ideas]] instead of the code.

## Phase 2 — Frontend (UI, Blocks & Hot-Reload)

Slots, blocks, data blocks, the editor and hot reload. ^ui-done

### Über-Plan: «Blöcke» & 日本語?

Yes, headings can contain guillemets, umlauts and Japanese. The slug for this one is an open question
for the markdown team.

#### Data blocks

Table, list, cards, stat, chart. The chart block must handle the messy ratings in [[Dune|the books]].

##### Even deeper

Five levels is silly, but real notes do this.

## Phase 3: GenUI — "make me a dashboard"

The demo prompt: *make a dashboard of how I read and rate books*. See [[Reading Challenge 2026]] for the
data it will chew on.

## Notes

The second "Notes" section on purpose: duplicate headings happen when you append to a note over time.
Jump back to the first one with [[#Notes]].

- 2026-10-02: phase 1 scope frozen.
- 2026-10-09: started the sample vault.
