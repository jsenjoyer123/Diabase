---
title: Broken Frontmatter
tags: [unclosed, list
status: draft
  owner: me
---

# Invalid Frontmatter

The flow list on the `tags` line is never closed and the `owner` line is indented under a scalar. A
reader must not crash on this note: it should report a frontmatter error, treat the data as empty, and
still index the body, including this link to [[Frontmatter Torture]] and the tag #testing/invalid-yaml.
