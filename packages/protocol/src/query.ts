// Index, query and search contracts. The query language is structured JSON
// (not a Dataview-style string) so the GenUI agent can emit it reliably and the
// index can validate it with `NoteQuery`.
import { z } from 'zod'
import type { ContentHash, VaultPath } from './vault.ts'

export interface LinkRef {
  /** Raw target as written: `Dune`, `Books/Dune`, `Dune#Plot`. */
  target: string
  /** Resolved vault path, or null if the link is dangling. */
  resolved: VaultPath | null
  heading?: string
  display?: string
  embed: boolean
  line: number
}

export interface Heading {
  level: number
  text: string
  slug: string
  line: number
}

export interface TaskItem {
  text: string
  done: boolean
  line: number
}

export interface NoteRecord {
  path: VaultPath
  /** First H1, else frontmatter `title`, else file name without extension. */
  title: string
  frontmatter: Record<string, unknown>
  /** Normalized without `#`, frontmatter + body, nested tags kept as `a/b`. */
  tags: string[]
  aliases: string[]
  links: LinkRef[]
  headings: Heading[]
  tasks: TaskItem[]
  wordCount: number
  size: number
  mtimeMs: number
  ctimeMs: number
  hash: ContentHash
}

/**
 * Field reference. `file.*` is reserved for built-ins
 * (`file.path`, `file.name`, `file.folder`, `file.mtime`, `file.ctime`, `file.size`,
 * `file.tags`, `file.links`, `file.backlinks`, `file.tasks`, `file.title`, `file.words`);
 * anything else addresses frontmatter, with dots for nesting (`series.name`).
 */
export const FieldRef = z.string().min(1)

const Scalar = z.union([z.string(), z.number(), z.boolean(), z.null()])

export const FilterOp = z.enum([
  '=', '!=', '<', '<=', '>', '>=',
  'contains', // string contains / list includes
  'startsWith',
  'in', // value is a list; field equals one of them
  'exists', // value ignored
  'missing', // value ignored
])

export type Filter =
  | { field: string; op: z.infer<typeof FilterOp>; value?: unknown }
  | { and: Filter[] }
  | { or: Filter[] }
  | { not: Filter }

export const Filter: z.ZodType<Filter> = z.lazy(() =>
  z.union([
    z.object({ field: FieldRef, op: FilterOp, value: z.union([Scalar, z.array(Scalar)]).optional() }),
    z.object({ and: z.array(Filter) }),
    z.object({ or: z.array(Filter) }),
    z.object({ not: Filter }),
  ]),
)

export const NoteQuery = z.object({
  from: z
    .object({
      folder: z.union([z.string(), z.array(z.string())]).optional(),
      tag: z.union([z.string(), z.array(z.string())]).optional(),
      paths: z.array(z.string()).optional(),
    })
    .optional()
    .describe('Source set. Omitted = whole vault (excluding .diabase/).'),
  where: Filter.optional(),
  select: z.array(FieldRef).optional().describe('Fields to return per row. Default: file.path, file.title.'),
  sort: z.array(z.object({ field: FieldRef, dir: z.enum(['asc', 'desc']).default('asc') })).optional(),
  groupBy: FieldRef.optional(),
  limit: z.number().int().positive().max(10_000).optional(),
  offset: z.number().int().nonnegative().optional(),
})
export type NoteQuery = z.infer<typeof NoteQuery>

export interface QueryRow {
  path: VaultPath
  values: Record<string, unknown>
}

export interface QueryResult {
  rows: QueryRow[]
  total: number
  groups?: Array<{ key: unknown; rows: QueryRow[] }>
}

export type FieldType = 'string' | 'number' | 'boolean' | 'date' | 'list' | 'object' | 'null'

/** Summary of the vault's shape — the GenUI agent's main input for "what data exists". */
export interface VaultSchema {
  noteCount: number
  folders: Array<{ path: VaultPath; noteCount: number }>
  tags: Array<{ tag: string; count: number }>
  fields: Array<{
    key: string
    count: number
    types: Partial<Record<FieldType, number>>
    /** Up to ~5 distinct sample values. */
    examples: unknown[]
    /** Folders where this key appears most, descending. */
    topFolders: Array<{ path: VaultPath; count: number }>
  }>
}

export interface IndexService {
  /** Resolves once the initial full scan has completed. */
  ready(): Promise<void>
  get(path: VaultPath): Promise<NoteRecord | null>
  backlinks(path: VaultPath): Promise<Array<{ source: VaultPath; link: LinkRef }>>
  resolveLink(target: string, from?: VaultPath): Promise<VaultPath | null>
  tags(): Promise<Array<{ tag: string; count: number }>>
  /** Validates with `NoteQuery`; throws a descriptive error on invalid queries. */
  query(query: NoteQuery): Promise<QueryResult>
  schema(scope?: { folder?: VaultPath; tag?: string }): Promise<VaultSchema>
}

export interface SearchHit {
  path: VaultPath
  title: string
  score: number
  snippets: Array<{ line: number; text: string; ranges: Array<[start: number, end: number]> }>
}

export interface QuickOpenHit {
  path: VaultPath
  title: string
  score: number
  /** Character ranges in `path` that matched, for highlighting. */
  matches: Array<[start: number, end: number]>
}

export interface SearchService {
  search(text: string, options?: { limit?: number; folder?: VaultPath; tag?: string }): Promise<SearchHit[]>
  /** Fuzzy match over file names, paths, titles and aliases. */
  quickOpen(text: string, options?: { limit?: number }): Promise<QuickOpenHit[]>
}
