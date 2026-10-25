---
# Frontmatter torture test. This full-line comment must survive any edit.
title: "Frontmatter \"Torture\" Test"  # trailing comment after a double-quoted string
zeta: first key after title, although alphabetically last
subtitle: 'It''s single-quoted, with an escaped quote'
rating: 3  # the key round-trip tests should edit
alpha: true

# A blank line above and this comment: both must stay where they are.
tags:
  - testing/frontmatter
  - round-trip
aliases: [FM Torture, "Torture: the note", 'single, quoted']
numbers: [1, 2.5, -3, 1e3, 0x1F]
unindented_list:
- first
- second
point: {x: 1, y: -2}
project:
  name: Diabase
  meta:
    owner: me
    links:
      repo: https://example.com/diabase.git  # three levels deep
      docs: "https://example.com/docs#intro"
  phases: [backend, frontend, genui]

defaults: &defaults
  retries: 3
  timeout_s: 30
staging: *defaults
accent: &accent "#ff0000"
highlight: *accent
summary: |
  A literal block scalar keeps its line breaks.
  This is the second line.

  A blank line inside the scalar is part of the value.
folded: >
  A folded block scalar
  turns these three lines
  into one.
created: 2026-10-09
updated: 2026-10-09T18:45:00
draft: false
reviewed: ~
empty_value:
quoted_number: "007"
"dotted.key": a key that contains a dot
unicode: "Zürich — 東京"
colon_in_value: 'Fear is the mind-killer: the little-death'
---

# Frontmatter Torture

This note exists to break frontmatter writers. Editing a single key (for example setting `rating` to 4)
must leave every other byte of the file identical: comments, blank lines, quoting style, flow vs block
lists, key order, anchors and aliases, and both block scalars.

Do not tidy it up. The mess is the point.
