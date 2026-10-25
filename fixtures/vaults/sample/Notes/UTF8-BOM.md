---
title: UTF-8 BOM
encoding: utf-8 with BOM
tags: [testing/bom]
---

# UTF-8 BOM

This file starts with the three bytes EF BB BF before the opening `---`. The frontmatter must still be
detected, the BOM must not end up in the first key, and a write must preserve the BOM. Links still
work: [[Frontmatter Torture]].
