---
title: Tag Edge Cases
tags:
  - reference
  - testing/tags
---

# Tag Edge Cases

#inbox at the very start of a line is a tag, not a heading (there is no space after the hash).

In the middle of a sentence, #reading/fiction is a nested tag, and so is #reading/non-fiction.
At the end of a sentence the full stop is not part of the tag: #project.
Commas and semicolons too: #alpha, #beta; #gamma!
Mixed case #Reading/Fiction is the same tag as reading/fiction once tags are compared case-insensitively.
A tag that starts with digits but has letters is still a tag: #2026goals.

## Not tags

- Pure numbers: #123, and issue #42 in the tracker.
- URL fragments: https://example.com/docs#install and [the anchor](https://example.com/page#anchor).
- Language names: C# and F# are not tags.
- Inside a word: foo#bar and mail@example.com#nope.
- Escaped: \#not-a-tag
- Inline code: `#not-a-tag-either`
- The line `# Tag Edge Cases` at the top is a heading, not the tag "Tag".

## Undecided

Hex colours in prose: the accent colour is #ff0000 and the background is #fff. Obsidian would index
both as tags because they contain letters; see the fixture README for the open decision.
