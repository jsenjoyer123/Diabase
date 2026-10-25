// Tokenizing and snippet extraction. The same tokenizer feeds MiniSearch and the
// snippet highlighter, so a matched index term always lines up with line tokens.
import type { SearchHit } from '@diabase/protocol'

export type Range = [start: number, end: number]

const TOKEN = /[\p{L}\p{N}]+/gu

export function tokenize(text: string): string[] {
  return text.match(TOKEN) ?? []
}

export function processTerm(term: string): string {
  return term.toLowerCase()
}

export interface SplitNote {
  body: string
  /** Number of lines taken by the leading frontmatter block (0 when absent). */
  lineOffset: number
}

/** Splits off a leading `---` frontmatter block so snippets skip it but keep real line numbers. */
export function splitFrontmatter(content: string): SplitNote {
  const lines = content.split(/\r?\n/)
  if (lines[0]?.trim() !== '---') return { body: content, lineOffset: 0 }
  for (let i = 1; i < lines.length; i++) {
    const line = lines[i]!.trim()
    if (line === '---' || line === '...') {
      return { body: lines.slice(i + 1).join('\n'), lineOffset: i + 1 }
    }
  }
  return { body: content, lineOffset: 0 }
}

const MAX_SNIPPET_CHARS = 240
const MAX_SNIPPETS = 3

/**
 * Up to three lines containing matched terms. Lines with more distinct matched
 * terms win; the chosen lines are returned in document order.
 */
export function buildSnippets(body: string, lineOffset: number, matched: ReadonlySet<string>): SearchHit['snippets'] {
  if (matched.size === 0) return []
  const lines = body.split(/\r?\n/)
  const candidates: Array<{ index: number; distinct: number; ranges: Range[] }> = []
  for (let index = 0; index < lines.length; index++) {
    const line = lines[index]!
    if (line.trim() === '') continue
    const ranges: Range[] = []
    const seen = new Set<string>()
    for (const m of line.matchAll(TOKEN)) {
      const term = processTerm(m[0])
      if (!matched.has(term)) continue
      seen.add(term)
      ranges.push([m.index, m.index + m[0].length])
    }
    if (ranges.length > 0) candidates.push({ index, distinct: seen.size, ranges })
  }
  candidates.sort((a, b) => b.distinct - a.distinct || b.ranges.length - a.ranges.length || a.index - b.index)
  return candidates
    .slice(0, MAX_SNIPPETS)
    .sort((a, b) => a.index - b.index)
    .map(({ index, ranges }) => {
      const { text, ranges: shifted } = clip(lines[index]!, ranges)
      return { line: lineOffset + index + 1, text, ranges: shifted }
    })
}

/** Trims long lines to a window around the first match, shifting ranges to match. */
function clip(line: string, ranges: Range[]): { text: string; ranges: Range[] } {
  if (line.length <= MAX_SNIPPET_CHARS) return { text: line, ranges }
  const first = ranges[0]![0]
  const start = Math.max(0, Math.min(first - 40, line.length - MAX_SNIPPET_CHARS))
  const end = Math.min(line.length, start + MAX_SNIPPET_CHARS)
  const shifted: Range[] = []
  for (const [s, e] of ranges) {
    if (s >= start && e <= end) shifted.push([s - start, e - start])
  }
  return { text: line.slice(start, end), ranges: shifted }
}
