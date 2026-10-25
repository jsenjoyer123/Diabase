---
type: demo/hello
title: Hello
description: >-
  Minimal authored block that greets someone by name and counts waves. Use it to smoke-test the
  bundler and hot loader. It reads no notes and writes nothing.
version: 0.1.0
props:
  type: object
  properties:
    name:
      type: string
      description: Who to greet.
      default: world
  additionalProperties: false
parts: {}
data:
  note: none
  query: none
  writes: []
regions: [main, sidebar]
origin:
  kind: source
  dir: .diabase/blocks/demo/hello
  entry: index.tsx
---

# Hello

Renders `Hello, <name>!` and a "Wave" button that counts clicks.

- **Props:** `name` (string, default `world`).
- **Data:** none. The wave count lives in React state only, so it resets whenever the block is
  remounted, which makes hot reloads easy to see.
- **Imports:** `react` and a type-only import from `@diabase/sdk`.

Embed it in a note with a `block` fence:

```block
id: hello-1
type: demo/hello
props:
  name: Diabase
```
