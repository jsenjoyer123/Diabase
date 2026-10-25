// Diagnostic construction and esbuild message mapping (README §9). Output is plain data only:
// no esbuild objects, no virtual namespaces, no absolute host paths.
import type { Message, Note } from 'esbuild'
import type { Diagnostic } from '@diabase/protocol'

export interface Where {
  file?: string
  line?: number
  column?: number
  lineText?: string
}

/** A `Diagnostic` without `undefined`-valued keys (keeps results `structuredClone`-stable). */
export function diagnostic(text: string, where: Where = {}): Diagnostic {
  const d: Diagnostic = { text }
  if (where.file !== undefined) d.file = where.file
  if (where.line !== undefined) d.line = where.line
  if (where.column !== undefined) d.column = where.column
  if (where.lineText !== undefined) d.lineText = where.lineText
  return d
}

/**
 * Converts esbuild's 0-based UTF-8 byte column into a 1-based UTF-16 code-unit column, the unit
 * editors and `tsc` show. A byte offset inside a multi-byte character rounds up to the next
 * character.
 */
export function byteColumnToUtf16(lineText: string, byteColumn: number): number {
  let bytes = 0
  let units = 0
  for (const ch of lineText) {
    if (bytes >= byteColumn) break
    const cp = ch.codePointAt(0)!
    bytes += cp < 0x80 ? 1 : cp < 0x800 ? 2 : cp < 0x10000 ? 3 : 4
    units += ch.length
  }
  return units + 1
}

/** What the message mapper needs to know about the virtual file system esbuild ran against. */
export interface PathMapper {
  /** Maps an esbuild location file (`<namespace>:<virtual path>`) to a `Diagnostic.file`, or `undefined`. */
  fileOf(esbuildFile: string): string | undefined
  /** Replaces virtual paths inside free text with their `Diagnostic.file` form. */
  scrub(text: string): string
}

function formatNote(note: Note, mapper: PathMapper): string {
  let text = mapper.scrub(note.text)
  const loc = note.location
  const file = loc ? mapper.fileOf(loc.file) : undefined
  if (loc && file !== undefined) {
    const at = `${file}:${loc.line}:${byteColumnToUtf16(loc.lineText, loc.column)}`
    text += text.endsWith(':') ? ` ${at}` : ` (${at})`
  }
  return `\n  note: ${text}`
}

/** One esbuild message to one `Diagnostic`. Notes are appended to `text` as `\n  note: …`. */
export function mapMessage(message: Message, mapper: PathMapper): Diagnostic {
  let text = mapper.scrub(message.text)
  for (const note of message.notes) text += formatNote(note, mapper)
  const loc = message.location
  if (!loc) return diagnostic(text)
  const file = mapper.fileOf(loc.file)
  if (file === undefined) return diagnostic(text)
  return diagnostic(text, {
    file,
    line: loc.line,
    column: byteColumnToUtf16(loc.lineText, loc.column),
    lineText: loc.lineText,
  })
}

export function failure(errors: Diagnostic[], warnings: Diagnostic[] = []) {
  return { ok: false as const, errors, warnings }
}
