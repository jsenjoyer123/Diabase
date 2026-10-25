// Public data shapes of @diabase/markdown. Everything here is plain data
// (structured-clone safe): it is produced in main for the index and in the
// renderer for the editor.
//
// Line numbers are 1-based and count lines of the *whole source* (frontmatter
// included), so they map directly onto editor lines.
import type { Heading, TaskItem } from '@diabase/protocol'

export type { Heading, TaskItem }

export interface FrontmatterError {
  message: string
  /** 1-based source line of the problem, when the YAML parser reports one. */
  line: number | null
}

export interface ParsedFrontmatter {
  /** True when the source starts (after an optional BOM) with a closed `---` block. */
  present: boolean
  /**
   * Parsed mapping; `{}` when absent, empty, invalid or not a mapping. Values are
   * plain JSON-like data: YAML timestamps stay ISO strings (core schema), maps
   * are objects, no `Date`/`Map`/`bigint`.
   */
  data: Record<string, unknown>
  /** YAML text between the fences (exclusive), `''` when absent. */
  raw: string
  /** Everything after the closing fence line — an exact slice of `source`. */
  body: string
  /** UTF-16 offset of `body` in `source`. */
  bodyOffset: number
  /** 1-based source line on which `body` starts. */
  bodyStartLine: number
  /** Set when the block exists but is not valid YAML or not a mapping. */
  error: FrontmatterError | null
}

export interface ExtractedLink {
  /** Target as written, without heading/block suffix: `Books/Dune`, `../a.md`, `''` for `[[#H]]`. */
  target: string
  /** `[[Dune#Plot]]` → `Plot`. */
  heading?: string
  /** `[[Dune#^abc]]` → `abc`. */
  block?: string
  /** `[[Dune|the book]]` → `the book`; markdown link text. */
  display?: string
  /** `![[…]]` or `![](…)`. */
  embed: boolean
  /** `wiki` = `[[…]]` (vault-wide name resolution); `markdown` = `[](…)` (relative to the note's folder). */
  kind: 'wiki' | 'markdown'
  line: number
}

/** Everything the index needs from one note, computed in a single pass. */
export interface NoteExtract {
  frontmatter: Record<string, unknown>
  frontmatterError: FrontmatterError | null
  /** First H1, else frontmatter `title`, else file name without extension. */
  title: string
  /** Frontmatter `aliases` / `alias` (list or string), trimmed, deduped. */
  aliases: string[]
  /** Without `#`; frontmatter `tags`/`tag` + body tags; nested kept as `a/b`; deduped case-insensitively. */
  tags: string[]
  /** Unresolved links; the index resolves them into `LinkRef`s. External URLs are excluded. */
  links: ExtractedLink[]
  headings: Heading[]
  tasks: TaskItem[]
  wordCount: number
}
