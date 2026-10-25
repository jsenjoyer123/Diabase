// Source map v3 rewriting: rename `sources`, drop sources that must not be exposed (the virtual
// entry module), set `sourceRoot`. Only the `mappings` segment structure is touched; generated
// positions and names are preserved.

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/'
const BASE64_INDEX = new Map([...BASE64].map((ch, i) => [ch, i]))

/** One decoded mapping segment: [generatedColumn] or [generatedColumn, source, line, column, name?]. */
type Segment = number[]

function decodeMappings(mappings: string): Segment[][] {
  const lines: Segment[][] = []
  let source = 0
  let line = 0
  let column = 0
  let name = 0
  for (const lineText of mappings.split(';')) {
    const segments: Segment[] = []
    let generatedColumn = 0
    if (lineText !== '') {
      for (const raw of lineText.split(',')) {
        const fields: number[] = []
        let shift = 0
        let value = 0
        for (const ch of raw) {
          const digit = BASE64_INDEX.get(ch)
          if (digit === undefined) throw new Error('invalid sourcemap mappings')
          value += (digit & 31) << shift
          if (digit & 32) {
            shift += 5
          } else {
            fields.push(value & 1 ? -(value >> 1) : value >> 1)
            value = 0
            shift = 0
          }
        }
        generatedColumn += fields[0] ?? 0
        if (fields.length === 1) {
          segments.push([generatedColumn])
          continue
        }
        source += fields[1] ?? 0
        line += fields[2] ?? 0
        column += fields[3] ?? 0
        if (fields.length >= 5) {
          name += fields[4] ?? 0
          segments.push([generatedColumn, source, line, column, name])
        } else {
          segments.push([generatedColumn, source, line, column])
        }
      }
    }
    lines.push(segments)
  }
  return lines
}

function encodeVlq(value: number): string {
  let vlq = value < 0 ? (-value << 1) | 1 : value << 1
  let out = ''
  do {
    let digit = vlq & 31
    vlq >>>= 5
    if (vlq > 0) digit |= 32
    out += BASE64[digit]
  } while (vlq > 0)
  return out
}

function encodeMappings(lines: Segment[][]): string {
  let source = 0
  let line = 0
  let column = 0
  let name = 0
  return lines
    .map((segments) => {
      let generatedColumn = 0
      return segments
        .map((seg) => {
          let out = encodeVlq(seg[0]! - generatedColumn)
          generatedColumn = seg[0]!
          if (seg.length > 1) {
            out += encodeVlq(seg[1]! - source) + encodeVlq(seg[2]! - line) + encodeVlq(seg[3]! - column)
            source = seg[1]!
            line = seg[2]!
            column = seg[3]!
            if (seg.length > 4) {
              out += encodeVlq(seg[4]! - name)
              name = seg[4]!
            }
          }
          return out
        })
        .join(',')
    })
    .join(';')
}

interface RawSourceMap {
  version: number
  sources: string[]
  sourcesContent?: Array<string | null>
  names?: string[]
  mappings: string
  sourceRoot?: string
  file?: string
}

export interface RewriteOptions {
  /** New name for a source, or `null` to drop it (its mappings become unmapped). */
  mapSource(source: string): string | null
  sourceRoot: string
}

/** Returns the rewritten map as a JSON string. */
export function rewriteSourceMap(json: string, options: RewriteOptions): string {
  const map = JSON.parse(json) as RawSourceMap
  const remap: number[] = []
  const sources: string[] = []
  const sourcesContent: Array<string | null> = []
  map.sources.forEach((source, i) => {
    const renamed = options.mapSource(source)
    if (renamed === null) {
      remap[i] = -1
      return
    }
    remap[i] = sources.length
    sources.push(renamed)
    sourcesContent.push(map.sourcesContent?.[i] ?? null)
  })

  const lines = decodeMappings(map.mappings).map((segments) =>
    segments.map((seg): Segment => {
      if (seg.length === 1) return seg
      const next = remap[seg[1]!]
      if (next === undefined || next < 0) return [seg[0]!]
      return [seg[0]!, next, ...seg.slice(2)]
    }),
  )

  const out: Record<string, unknown> = {
    version: 3,
    sourceRoot: options.sourceRoot,
    sources,
    ...(map.sourcesContent ? { sourcesContent } : {}),
    names: map.names ?? [],
    mappings: encodeMappings(lines),
  }
  return JSON.stringify(out)
}

/** Test/validation helper: decoded mappings as [generatedLine, generatedColumn, source, line, column] (0-based). */
export function decodeSourceMap(json: string): Array<[number, number, number, number, number]> {
  const out: Array<[number, number, number, number, number]> = []
  decodeMappings((JSON.parse(json) as RawSourceMap).mappings).forEach((segments, generatedLine) => {
    for (const seg of segments) {
      if (seg.length >= 4) out.push([generatedLine, seg[0]!, seg[1]!, seg[2]!, seg[3]!])
    }
  })
  return out
}
