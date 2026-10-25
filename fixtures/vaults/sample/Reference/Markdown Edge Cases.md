---
title: Markdown Edge Cases
tags: [reference, testing/markdown]
---

# Markdown Edge Cases

A scrapbook of syntax that parsers get wrong. Nothing inside code, comments or math may produce a link,
a tag or a task. Every fake target below is named "Inside …" or "Hidden …" so a leak is easy to spot.

Setext Heading Level One
========================

Text under a Setext H1. It is a level-1 heading, but not the first one, so the title stays
"Markdown Edge Cases".

Setext Heading Level Two
------------------------

## Fenced code with backticks

```js
// [[Inside Backtick Fence]] and #in-backtick-fence are code, not a link or a tag
const accent = '#ff0000'
- [ ] not a task, this is inside a fence
```

## Fenced code with tildes

~~~python
# [[Inside Tilde Fence]] #in-tilde-fence
print("a line with ~~~ in the middle does not close the fence")
~~~

## A longer fence containing a shorter one

````markdown
```
[[Inside Nested Fence]] #in-nested-fence
```
Still inside the four-backtick fence: [[Inside Outer Fence]]
````

## Inline code

Write `[[Inside Inline Code]]` to link and `#inline-code-tag` to tag. Double backticks work too:
``a `[[Inside Double Backticks]]` b``.

## HTML comments

<!-- [[hidden]] #hidden-tag -->

<!--
[[Hidden Multiline]]
#hidden-multiline
- [ ] hidden task
-->

## Math

Inline math such as $e^{i\pi} + 1 = 0$ is left alone.

$$
\text{pages per day} = \frac{\sum_i p_i}{d} \quad \text{see #mathtag and [[Inside Math]]}
$$

## Not frontmatter

Fences in the middle of a body are not frontmatter. Below: a thematic break, then a paragraph whose
`---` underline makes it a Setext H2.

---
not: frontmatter
---

## Tables

| Book | Why it's here |
| ---- | ------------- |
| [[Dune\|Dune in a table]] | the pipe is escaped so the table survives |

## Embedded block

```block
id: hello-in-note
type: demo/hello
props:
  name: Edge Cases
```

## Real ones

After all that, one real link, [[Dune]], and one real tag, #reference/markdown.
