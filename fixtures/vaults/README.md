# Fixture vaults

`sample/` is the shared fixture vault. Unit and integration tests for vault, markdown, index, search,
bundler and hot reload use it, and so does the dev app. It reads like a real person's vault (a reading
log, a journal, a few projects), and it also contains deliberate traps for parsers, link resolvers and
frontmatter writers.

This README sits outside `sample/` so it is not part of the vault.

**Rules for tests**

- Treat `sample/` as read-only. Tests that write must first copy it to a scratch dir (e.g. under the
  gitignored `.tmp/`).
- If you change the vault, recompute every number in [Counts](#counts) and update this file in the
  same commit.
- `.gitattributes` in this folder marks the CRLF and BOM notes `-text`, so git never normalises them.
  Don't open-and-save those two in an editor that rewrites line endings or strips BOMs.

## Inventory

58 Markdown notes outside `.diabase/`, plus 2 PNG attachments and one authored block (2 files).

### Vault root (2)

| File | What |
| --- | --- |
| `Welcome.md` | Start page. Links to alias `[[Sir Terry]]`, `[[Spec]]`, a non-ASCII heading link, and a ```` ```block ```` fence mounting `demo/hello`. |
| `Inbox.md` | Contains the dangling `[[Nonexistent Note]]`. `tags: inbox` is a scalar string, not a list. |

### `Books/` (18)

The GenUI demo dataset ("make a dashboard of how I read and rate books"). Fields: `title`, `author`,
`rating`, `status`, `started`, `finished`, `genre`, `pages`, `tags`, plus optional `aliases`, `series`
(`{name, index}`) and `cover`.

| File | Author | Status | Rating | Started | Finished | Pages | Genre |
| --- | --- | --- | --- | --- | --- | --- | --- |
| `A Wizard of Earthsea.md` | Ursula K. Le Guin | finished | `"4"` (string) | 2025-10-02 | 2025-10-19 | 183 | fantasy, classic |
| `Atomic Habits.md` | James Clear | finished | 2 | 2026-06-03 | 2026-06-21 | 320 | self-help, non-fiction |
| `Children of Dune.md` | `"[[Frank Herbert]]"` | reading | 4 | 2026-09-20 | | 444 | sci-fi, classic |
| `Dune.md` | `"[[Frank Herbert]]"` | finished | 5 | 2025-01-04 | 2025-02-09 | 617 | sci-fi, classic |
| `Dune Messiah.md` | `"[[Frank Herbert]]"` | finished | 3 | 2025-02-11 | 2025-03-02 | 256 | sci-fi |
| `Exhalation.md` | Ted Chiang | finished | 4 | 2026-02-10 | `2026-03-14T21:30:00` | 350 | sci-fi, short-stories |
| `Guards! Guards!.md` | Terry Pratchett | finished | 5 | 2025-07-16 | 2025-08-03 | 355 | fantasy, humor |
| `Noise.md` | Daniel Kahneman | want | | | | 454 | psychology, non-fiction |
| `Piranesi.md` | Susanna Clarke | want | | | | 272 | fantasy |
| `Project Hail Mary.md` | Andy Weir | finished | 4 | 2026-04-02 | 2026-04-26 | 476 | sci-fi |
| `Sapiens.md` | Yuval Noah Harari | finished | 3 | 2025-03-05 | 2025-04-20 | 443 | history, non-fiction |
| `Small Gods.md` | Terry Pratchett | reading | 4 | 2026-10-05 | | 284 | fantasy, humor, philosophy |
| `Stories of Your Life and Others.md` | Ted Chiang | finished | 5 | 2026-01-03 | 2026-02-01 | 281 | `sci-fi` (scalar) |
| `The Dispossessed.md` | Ursula K. Le Guin | finished | 4.5 | 2025-11-01 | 2025-12-14 | 387 | sci-fi, philosophy |
| `The Left Hand of Darkness.md` | Ursula K. Le Guin | finished | 5 | 2025-04-22 | 2025-05-18 | 304 | sci-fi, classic |
| `The Name of the Wind.md` | Patrick Rothfuss | want | | | | 662 | fantasy |
| `The Pragmatic Programmer.md` | David Thomas & Andrew Hunt | finished | 4 | 2025-08-10 | 2025-09-28 | 352 | programming, non-fiction |
| `Thinking, Fast and Slow.md` | Daniel Kahneman (`Author:` key) | finished | 4 | 2025-05-20 | 2025-07-15 | 499 | psychology, non-fiction |

Conventions: `want` books have no `rating`, `started` or `finished`. `reading` books have `started` and
a provisional `rating` but no `finished`. `finished` books have all three. Tags are `book` plus
`reading/fiction` (13 books) or `reading/non-fiction` (5 books).
`series` appears on 9 books (block style on 7, flow style `{name: …, index: …}` on Earthsea and
Guards! Guards!). `aliases` appears on 4 books (Dune, The Left Hand of Darkness, Stories of Your Life
and Others, Thinking, Fast and Slow). `cover: attachments/dune-cover.png` appears only on Dune.

### `People/` (5)

`Frank Herbert.md` (aliases `[F. Herbert]`), `Ursula K. Le Guin.md` (`[Ursula Le Guin, Le Guin]`),
`Ted Chiang.md` (`aliases: Chiang` as a scalar string, `born: 1967` as a bare integer),
`Daniel Kahneman.md` (`[Kahneman, D. Kahneman]`), `Terry Pratchett.md` (`[Sir Terry, Pratchett]`).
All tagged `people/author`. Patrick Rothfuss has no note on purpose; links to him dangle.

### `Daily/` (12)

`2026-10-01.md` … `2026-10-12.md`. Frontmatter: `date`, `mood` (string), `sleep` (hours: floats such as
7.5 and integers such as 9). Every note has a body `#journal` tag. `2026-10-07.md` has no `sleep` key.
Tasks include nested tasks (up to 3 levels), ordered-list tasks (`1. [x] …`) and tasks inside a
blockquote (`> - [ ] …`).

### `Projects/` (6: 3 direct, 3 in `Projects/Diabase/`)

| File | What |
| --- | --- |
| `Projects/Ideas.md` | Same basename as `Archive/Ideas.md`. Relative Markdown links, `[[Dune\|the spice book]]`, a bare external URL. |
| `Projects/Reading Challenge 2026.md` | Table with an escaped-pipe wikilink, shortlist tasks. |
| `Projects/Garden Redesign.md` | Bare, ambiguous `[[Ideas]]`. Non-ASCII heading `Pflanzen & Beete (Frühjahr '27)`. |
| `Projects/Diabase/Diabase Roadmap.md` | Headings H1 to H5, two `## Notes`, non-ASCII and punctuated headings, block ids `^abc123` and `^ui-done`, self-link `[[#Notes]]`, alias `Roadmap`. |
| `Projects/Diabase/Overview.md` | Embeds (`![[diagram.png]]`, `![[Diabase Roadmap#Phase 1]]`), block-ref link, angle-bracket and percent-encoded Markdown links, Markdown image. |
| `Projects/Diabase/Architecture Sketch.md` | Sized embed `![[diagram.png\|200]]`, a link inside a ```` ```text ```` fence, a heading link with punctuation. |

### Link-trap folders

- `Archive/Ideas.md` (1): the other `Ideas`.
- `Work/Plan.md` (1) and `Homework/Plan.md` (1): the segment-boundary trap.

### `Reference/` (3)

`Spec.md` (vault conventions, target of relative links), `Markdown Edge Cases.md` (code, comments,
math, Setext headings), `Tag Edge Cases.md`.

### `Notes/` (8): frontmatter and encoding edge cases

`Frontmatter Torture.md`, `Empty Frontmatter.md`, `Invalid Frontmatter.md`, `No Frontmatter.md`,
`List Frontmatter.md`, `CRLF-Line-Endings.md`, `UTF8-BOM.md`, `Café — Ünïcödé 日本語.md`.

### `Templates/` (1)

`Daily.md`: placeholders `{{date}}`, `{{title}}`, `{{time}}` (`date: "{{date}}"` is quoted so the YAML
stays valid). It is indexed like any note, so it adds one `journal` tag and one open task.

### `attachments/` (2 files, 0 notes)

`diagram.png` (16×16) and `dune-cover.png` (16×24): valid 8-bit RGB PNGs, under 300 bytes each.

### `.diabase/` (not notes)

`blocks/demo/hello/block.md` holds a `BlockManifest` (type `demo/hello`, origin `source`, dir
`.diabase/blocks/demo/hello`, entry `index.tsx`) and validates with `BlockManifest.parse`.
`blocks/demo/hello/index.tsx` default-exports a React component (`Hello`, prop `name`, plus a wave
counter in local state). It imports `useState` from `react` and only a type (`BlockProps`) from
`@diabase/sdk`, so the bundle requires only `react` and `react/jsx-runtime` (checked with esbuild).
There is no `config.yml`, `cache/` or `trash/`.

## Edge cases

### Link resolution

| Trap | Where | Expected |
| --- | --- | --- |
| Segment boundary | `[[Work/Plan]]` in `Daily/2026-10-02.md`, `-06`, `-12`, `Books/Exhalation.md`, `Books/The Pragmatic Programmer.md`, `Books/Thinking, Fast and Slow.md`, `Projects/Diabase/Diabase Roadmap.md`, `Reference/Spec.md` | Resolves to `Work/Plan.md`, **never** `Homework/Plan.md`. A naive `endsWith('Work/Plan.md')` matches both, and `Homework/…` sorts first. |
| Other side of the trap | `[[Homework/Plan]]` in `Daily/2026-10-08.md`, `Inbox.md`, `Projects/Ideas.md`, `Reference/Spec.md`, `Notes/Café — Ünïcödé 日本語.md` | `Homework/Plan.md`. |
| Same basename | `Projects/Ideas.md` and `Archive/Ideas.md`; `[[Projects/Ideas]]`, `[[Archive/Ideas]]` | Path-qualified links resolve exactly. |
| Ambiguous bare name | `[[Ideas]]` in `Projects/Garden Redesign.md` | Ambiguous. Suggested tie-break: prefer the source note's folder, which gives `Projects/Ideas.md`. See [Open decisions](#open-decisions). |
| Case only | `[[dune]]` in `Daily/2026-10-03.md` | `Books/Dune.md` (name matching is case-insensitive). |
| Alias | `[[Dune (novel)]]` and `[[Le Guin]]` (`Daily/2026-10-04.md`), `[[F. Herbert]]` (`Books/Children of Dune.md`), `[[TFAS]]` and `[[Roadmap]]` (`Work/Plan.md`), `[[Roadmap]]` (`Projects/Diabase/Overview.md`), `[[Sir Terry]]` (`Welcome.md`, `Inbox.md`) | Each resolves to the note that declares the alias. |
| Non-ASCII alias | `[[日本語ノート]]` in `Homework/Plan.md` | `Notes/Café — Ünïcödé 日本語.md`. |
| Display text | `[[Dune\|the spice book]]` (`Projects/Ideas.md`), `[[Dune\|the books]]` (Roadmap), `[[Projects/Ideas\|ideas list]]` (`Welcome.md`) | Target before the pipe, display after. |
| Escaped pipe in a table | `[[Atomic Habits\|the habits book]]` (`Projects/Reading Challenge 2026.md`), `[[Dune\|Dune in a table]]` (`Reference/Markdown Edge Cases.md`), written with a backslash before the pipe | Target `Atomic Habits` / `Dune` (no trailing backslash), display after the pipe. |
| Heading link | `[[Diabase Roadmap#Phase 1]]` (Overview embed, `Daily/2026-10-01.md`, `-12`, `Books/The Pragmatic Programmer.md`) | File is the Roadmap, heading `Phase 1`. |
| Punctuated heading link | `[[Diabase Roadmap#Phase 2 — Frontend (UI, Blocks & Hot-Reload)]]` (`Architecture Sketch.md`) | Heading matches exactly (em dash, parentheses, comma, ampersand). |
| Non-ASCII heading link | `[[Café — Ünïcödé 日本語#Überblick]]` (`Welcome.md`) | Resolves; heading `Überblick` exists. |
| Self heading link | `[[#Notes]]` in the Roadmap | Target `''` means the note itself. Two `## Notes` headings exist; this points at the first. |
| Block reference | `^abc123` (end of a paragraph line) and `^ui-done` in the Roadmap; `[[Diabase Roadmap#^abc123]]` in `Overview.md` and `Daily/2026-10-09.md` | Resolves to the Roadmap, block `abc123`. |
| Embeds | `![[diagram.png]]` (`Overview.md`), `![[diagram.png\|200]]` (`Architecture Sketch.md`; `200` is a width, not a display text), `![[dune-cover.png]]` (`Books/Dune.md`), `![[Diabase Roadmap#Phase 1]]` (`Overview.md`) | Attachments resolve by file name, extension included, to `attachments/…`. `embed: true`. |
| Relative Markdown links | `Projects/Ideas.md`: `[spec](../Reference/Spec.md)`, `[home](./Diabase/Overview.md)`, `[x](../People/Frank%20Herbert.md)` | Resolved relative to the note's folder and percent-decoded: `Reference/Spec.md`, `Projects/Diabase/Overview.md`, `People/Frank Herbert.md`. |
| Markdown link forms | `Overview.md`: `[roadmap](<Diabase Roadmap.md>)` (angle brackets, raw space), `[phase one](Diabase%20Roadmap.md#phase-1)` (slug fragment), `[spec](../../Reference/Spec.md)`, `![architecture diagram](../../attachments/diagram.png)` (image embed) | All resolve. Fragment is stripped for file resolution. |
| External URLs | bare `https://example.com/page#anchor` (`Projects/Ideas.md`), `https://example.com/docs#install` and `[the anchor](https://example.com/page#anchor)` (`Reference/Tag Edge Cases.md`) | Not vault links. `#install` / `#anchor` are not tags. |
| Dangling | `[[Nonexistent Note]]` (`Inbox.md` line 9), `[[Patrick Rothfuss]]` (`Books/The Name of the Wind.md` line 16) | `resolved: null`. These are the only two. |
| Frontmatter wikilinks | `author: "[[Frank Herbert]]"` in `Books/Dune.md`, `Books/Dune Messiah.md`, `Books/Children of Dune.md` | Plain strings in frontmatter. If the index treats them as links, they resolve to `People/Frank Herbert.md`. They are not part of the body link totals. |
| Name vs title | `[[Spec]]` (`Welcome.md`) → `Reference/Spec.md` (title "Vault Conventions"); `[[Noise]]` → `Books/Noise.md` (title "Noise: A Flaw in Human Judgment") | Resolution uses the file name, not the title. |
| Folder named like a note | `[[Templates/Daily]]` (`Reference/Spec.md`) while `Daily/` is a folder | `Templates/Daily.md`. |
| Punctuation in file names | `[[Guards! Guards!]]`, `[[Thinking, Fast and Slow]]`, `[[2026-10-05]]` | Resolve normally. |

### Markdown: things that must NOT be extracted

All fake targets are named `Inside …`, `Hidden …`, `hidden` or `not a link …`, so a leak is easy to
spot.

| Construct | Where | Expected |
| --- | --- | --- |
| ```` ``` ```` fence with `[[Inside Backtick Fence]]`, `#in-backtick-fence`, `'#ff0000'` and `- [ ] …` | `Reference/Markdown Edge Cases.md` | No link, tag or task. |
| `~~~` fence with `[[Inside Tilde Fence]]`, `#in-tilde-fence`, and a line containing `~~~` mid-line | same | The mid-line `~~~` does not close the fence. |
| 4-backtick fence containing a 3-backtick fence (`[[Inside Nested Fence]]`, `[[Inside Outer Fence]]`) | same | Only a 4+ backtick line closes it. |
| Inline code `` `[[Inside Inline Code]]` ``, `` `#inline-code-tag` ``, a double-backtick span | same | Not extracted. |
| HTML comments: `<!-- [[hidden]] #hidden-tag -->` and a multi-line one with `[[Hidden Multiline]]`, `#hidden-multiline`, `- [ ] hidden task` | same | Not extracted. |
| `$$ … $$` math with `#mathtag` and `[[Inside Math]]` | same | Not extracted. |
| `[[not a link in a code block]]` in a ```` ```text ```` fence | `Projects/Diabase/Architecture Sketch.md` | Not extracted. |
| `# Markdown Edge Cases` ATX heading | same note | A heading (and the title), not a tag. |
| Setext `Setext Heading Level One` (`===`) and `Setext Heading Level Two` (`---`) | same | Level 1 and level 2 headings. |
| Mid-body `---` / `not: frontmatter` / `---` | same | Not frontmatter. The first `---` is a thematic break; the second is a Setext underline, which makes `not: frontmatter` a level-2 heading. |
| ```` ```block ```` fences with a `BlockInstance` (`demo/hello`) | `Welcome.md`, `Reference/Markdown Edge Cases.md`, `block.md` body | Valid `BlockInstance` YAML (checked). Code, so nothing inside is extracted. |

`Reference/Markdown Edge Cases.md` has exactly 14 headings (11 ATX, 3 Setext), and one body link
(`[[Dune]]`) plus the escaped-pipe table link. The Roadmap has 10 headings: levels 1, 2, 3, 2, 2, 3,
4, 5, 2, 2, with `Notes` twice at level 2.

### Tags

| Note | Expected tags (frontmatter + body, deduplicated case-insensitively) |
| --- | --- |
| `Reference/Tag Edge Cases.md` | `reference`, `testing/tags`, `inbox` (line start), `reading/fiction` (mid-sentence; `#Reading/Fiction` later is the same tag), `reading/non-fiction`, `project` (full stop excluded), `alpha`, `beta`, `gamma` (comma, semicolon and `!` excluded), `2026goals` (digits then letters is a tag). Undecided: `ff0000`, `fff`. |
| ditto, **not** tags | `#123`, `#42` (pure numbers), `docs#install` / `page#anchor` (URL fragments), `C#`, `F#`, `foo#bar`, `mail@example.com#nope` (no whitespace before `#`), `\#not-a-tag` (escaped), `` `#not-a-tag-either` `` (inline code), the heading text `Tag Edge Cases`. |
| `Reference/Markdown Edge Cases.md` | `reference`, `testing/markdown`, `reference/markdown`. |
| `Notes/Café — Ünïcödé 日本語.md` | `café`, `learning/japanese`, `日本語`, `naïve/idées` (`#café` is in both frontmatter and body: count it once). |
| `Inbox.md` | `inbox` (frontmatter scalar `tags: inbox`). |
| `Notes/Invalid Frontmatter.md` | `testing/invalid-yaml` (body only; frontmatter unreadable). |

### Frontmatter

| Note | Case | Expected |
| --- | --- | --- |
| `Notes/Frontmatter Torture.md` | Full-line and trailing comments, a blank line plus comment between keys, a block list indented (`tags`) and one not indented (`unindented_list`), flow lists and a flow map, nesting 3 levels deep (`project.meta.links.repo`), `\|` and `>` block scalars (the `\|` one has an inner blank line), double quotes with escapes, single quotes with `''`, an anchor/alias on a map (`defaults: &defaults` → `staging: *defaults`) and on a scalar (`accent` → `highlight`), non-alphabetical key order, `1e3`, `0x1F`, `~` and empty values, a quoted `"007"`, a key containing a dot (`"dotted.key"`, which clashes with dotted `FieldRef` paths), a date and a datetime. | Parses to a mapping (see the parsed values below). **Round-trip:** changing one key (use `rating: 3` → `4`; it has a trailing comment) must leave every other byte identical. |
| `Notes/Empty Frontmatter.md` | `---` newline `---` | Present, `{}`, no error. |
| `Notes/Invalid Frontmatter.md` | Unclosed flow list plus a bad indent | `yaml` reports `Flow sequence in block collection must be sufficiently indented and end with a ]` at line 3, column 1 of the block. Expected: error set, data `{}`, body still indexed (title from H1, 1 link, 1 tag). |
| `Notes/No Frontmatter.md` | No fences, no H1 | Not present, `{}`. Title falls back to the file name. |
| `Notes/List Frontmatter.md` | Valid YAML sequence | Present, `{}`, error "not a mapping". |
| `Notes/CRLF-Line-Endings.md` | Every line ends in CR LF, fences included | Parses like LF: 3 keys, H1, 2 tasks (1 done, 1 open), 1 link, tag `testing/crlf`. Writers must keep CR LF. |
| `Notes/UTF8-BOM.md` | Starts with `EF BB BF`, then `---` (LF endings) | Frontmatter detected and the first key is `title`, not `﻿title`. Writers must keep the BOM. |
| `Templates/Daily.md` | `date: "{{date}}"`, empty `mood:` / `sleep:` | Valid; empty values parse as `null`. |
| Books, Daily, People | Unquoted ISO dates (`started: 2025-01-04`) | Strings under the YAML 1.2 core schema (`yaml`'s default), never `Date` objects. |
| `Work/Plan.md` | `quarter: 2026-Q4` | Date-like string. |

Parsed values of the torture note (`yaml` 2.x, `toJS()`): `numbers` = `[1, 2.5, -3, 1000, 31]`,
`staging` deep-equals `defaults`, `highlight` = `"#ff0000"`, `folded` = `"A folded block scalar turns
these three lines into one.\n"`, `reviewed` and `empty_value` = `null`, `created` = `"2026-10-09"`,
`updated` = `"2026-10-09T18:45:00"`.

**Round-trip probe (informational):** `parseDocument(raw)` → `setIn(['rating'], 4)` → `String(doc)`
changes **22 lines**, not 1. It pads flow collections (`[ a ]`), rewrites `1e3` → `1e+3` and `0x1F` →
`0x1f`, collapses the double space before trailing comments, indents `unindented_list`, and refolds the
`>` scalar. Even `String(doc)` with no edits is not byte-identical. A byte-preserving writer has to
splice the edited value into the original text using the node's source range.

### Books data messiness (exactly one of each)

| Mess | File | Notes |
| --- | --- | --- |
| `rating: "4"` (quoted string) | `Books/A Wizard of Earthsea.md` | Schema shows `rating` as number ×14, string ×1. |
| `rating: 4.5` | `Books/The Dispossessed.md` | Breaks the "whole stars" rule from `Reference/Spec.md`. |
| `finished: 2026-03-14T21:30:00` | `Books/Exhalation.md` | Datetime where every other `finished` is a date. Sorts correctly as a string. |
| `genre: sci-fi` (scalar) | `Books/Stories of Your Life and Others.md` | Every other `genre` is a list. A `contains sci-fi` filter should still match. |
| `Author:` (capital A) | `Books/Thinking, Fast and Slow.md` | No `author` key in that note. The schema shows `author` ×17 and `Author` ×1. |

Related irregularities that are not errors: `genre` is a block list in Earthsea; `series` is a flow map
in Earthsea and Guards! Guards!; frontmatter `title` differs from the file name in `Noise.md` and
`Sapiens.md`; `Books/Project Hail Mary.md` has an H1 that overrides its frontmatter title; one
`author` contains `&`.

### Titles (`NoteRecord.title` = first H1, else frontmatter `title`, else file name)

| Note | Expected title | Why |
| --- | --- | --- |
| `Books/Dune.md` (and all books except PHM) | `Dune` | frontmatter `title`, no H1 |
| `Books/Noise.md` | `Noise: A Flaw in Human Judgment` | frontmatter title ≠ file name |
| `Books/Project Hail Mary.md` | `Project Hail Mary — review` | H1 beats frontmatter |
| `Archive/Ideas.md` | `Ideas (2025, archived)` | H1 beats frontmatter `Ideas (archived)` |
| `Notes/Frontmatter Torture.md` | `Frontmatter Torture` | H1 beats frontmatter |
| `Notes/Invalid Frontmatter.md` | `Invalid Frontmatter` | H1 (frontmatter unreadable) |
| `Daily/2026-10-01.md` (all daily notes) | `2026-10-01` | no H1, no `title` |
| `Notes/No Frontmatter.md` | `No Frontmatter` | file name |
| `Reference/Markdown Edge Cases.md` | `Markdown Edge Cases` | first H1 (ATX) comes before the Setext H1 |
| `Templates/Daily.md` | `{{title}}` | literal placeholder H1 |

### Encoding and file names

- `Notes/Café — Ünïcödé 日本語.md`: non-ASCII file name stored NFC (verified), em dash, Japanese.
  Headings `Überblick`, `日本語の練習`, `Ça va ? — «oui» ! (über-punctuated)`, `Ελληνικά & Кириллица`.
- Spaces in file and folder names are common (`Books/The Left Hand of Darkness.md`).
- Only `Notes/CRLF-Line-Endings.md` contains CR; only `Notes/UTF8-BOM.md` has a BOM. Every other text
  file is LF, ends with a newline and has no trailing whitespace.

## Counts

All numbers were computed with scripts (`find`/`grep` plus a reference link checker that ignores code
fences, inline code, HTML comments and `$$` blocks), not by hand.

**Notes**

| Scope | Count |
| --- | --- |
| `.md` notes outside `.diabase/` | **58** |
| (vault root) | 2 |
| `Archive/` | 1 |
| `Books/` | 18 |
| `Daily/` | 12 |
| `Homework/` | 1 |
| `Notes/` | 8 |
| `People/` | 5 |
| `Projects/` (incl. 3 in `Projects/Diabase/`) | 6 |
| `Reference/` | 3 |
| `Templates/` | 1 |
| `Work/` | 1 |
| `attachments/` | 0 notes, 2 PNGs |
| files under `.diabase/` | 2 (`block.md`, `index.tsx`) |
| all files outside `.diabase/` | 60 |

Frontmatter state: 54 valid non-empty mappings, 1 empty (`Empty Frontmatter`), 1 invalid YAML
(`Invalid Frontmatter`), 1 not a mapping (`List Frontmatter`), 1 absent (`No Frontmatter`).

**Books**

| Measure | Value |
| --- | --- |
| books | 18 |
| `status: finished` / `reading` / `want` | **13 / 2 / 3** |
| with `rating` | 15 (13 finished + 2 reading): 14 numbers, 1 string |
| rating values | 5 ×4, 4 ×6, `"4"` ×1, 4.5 ×1, 3 ×2, 2 ×1 |
| mean rating of finished books (`"4"` coerced to 4) | 52.5 / 13 = 4.0385 |
| finished in 2025 / 2026 | 9 / 4 |
| with `started` / with `finished` | 15 / 13 |
| total pages (all 18) / finished only | 6939 / 4823 |
| books per genre (scalar `genre` counted as one item; multi-genre books count once per genre) | sci-fi 8, fantasy 5, non-fiction 5, classic 4, humor 2, philosophy 2, psychology 2, history 1, programming 1, self-help 1, short-stories 1 |
| pages per genre (same rule) | sci-fi 3115, non-fiction 2068, fantasy 1756, classic 1548, psychology 953, philosophy 671, humor 639, history 443, programming 352, short-stories 350, self-help 320 |
| authors (by `author`/`Author` value) | Ursula K. Le Guin 3, `[[Frank Herbert]]` 3, Ted Chiang 2, Terry Pratchett 2, Daniel Kahneman 2, and 1 each: James Clear, Susanna Clarke, Andy Weir, Yuval Noah Harari, Patrick Rothfuss, David Thomas & Andrew Hunt |

**Links** (bodies only, excluding code, comments and math)

| Measure | Value |
| --- | --- |
| wikilinks (including 4 embeds and the self-link `[[#Notes]]`) | 140 |
| relative Markdown links (including 1 image) | 7 |
| external Markdown links / bare URLs | 1 / 2 |
| frontmatter wikilink strings | 3 (all `[[Frank Herbert]]`) |
| **dangling** | **2**: `[[Nonexistent Note]]` (`Inbox.md`:9), `[[Patrick Rothfuss]]` (`Books/The Name of the Wind.md`:16) |
| ambiguous | 1: `[[Ideas]]` (`Projects/Garden Redesign.md`:11) |
| incoming links to `Books/Dune.md` | 12 from 11 notes (`[[Dune]]`, `[[dune]]`, `[[Dune (novel)]]`, display and escaped-pipe forms) |
| incoming links to `Work/Plan.md` / `Homework/Plan.md` | 8 from 8 notes / 5 from 5 notes |
| incoming links to `Projects/Ideas.md` / `Archive/Ideas.md` | 5 / 2 (plus the ambiguous `[[Ideas]]`) |
| incoming body links to `People/Frank Herbert.md` | 3 (`[[Frank Herbert]]`, `[[F. Herbert]]`, `../People/Frank%20Herbert.md`), plus the 3 frontmatter strings |

Line numbers count from line 1 of the file, frontmatter included.

**Tasks** (`- [ ]` / `- [x]`, any list marker, any nesting, inside blockquotes; never inside code or
comments)

| Scope | Done | Open | Total |
| --- | --- | --- | --- |
| `Daily/` | **23** | **20** | 43 |
| whole vault | 31 | 37 | 68 |

`Daily/` includes 7 nested tasks, 6 ordered-list tasks and 2 blockquote tasks. The whole-vault numbers
exclude the 2 fake tasks in `Reference/Markdown Edge Cases.md` (one in a fence, one in a comment). A
naive line grep finds 39 open.

Per daily note (done/open): 10-01 2/1, 10-02 3/2, 10-03 2/1, 10-04 2/2, 10-05 1/2, 10-06 3/3,
10-07 2/1, 10-08 2/1, 10-09 2/1, 10-10 2/2, 10-11 1/1, 10-12 1/3.

**Tags** (Obsidian-style rule: `#` at line start or after whitespace; letters, digits, `_`, `-`, `/`;
not all digits; frontmatter `tags` included; deduplicated per note case-insensitively)

- 40 distinct tags vault-wide, or 38 if hex colours are not tags.
- Notes per tag: `book` 18, `reading/fiction` 14, `journal` 13 (12 daily notes + the template),
  `reading/non-fiction` 6, `people/author` 5, `project` 5, `favorites` 4, `project/diabase` 4,
  `work` 4, `learning/japanese` 3, `reading` 3, `reference` 3.

## Open decisions

These are flagged rather than settled. The owning team should pick a rule and pin it in tests.

1. **Hex colours** (`#ff0000`, `#fff` in `Reference/Tag Edge Cases.md`). Obsidian indexes them as
   tags. Excluding "3/4/6/8 hex digits" would also drop real tags like `#cafe` or `#add`.
2. **Ambiguous bare links** (`[[Ideas]]` from `Projects/`). Suggested: same folder as the source
   first, then the shortest path, then alphabetical.
3. **Heading slugs** for duplicates (`Notes`, `Notes` → suggested `notes`, `notes-1`) and for
   non-ASCII or punctuated headings in the Roadmap and the Café note.
4. **Frontmatter wikilinks** (`author: "[[Frank Herbert]]"`): links or plain strings?
5. **Templates**: `Templates/Daily.md` is indexed today (tag `journal`, title `{{title}}`, one open
   task). Excluding a templates folder would change the tag and task counts above.
