// Full-text index over notes: BM25 (MiniSearch) with prefix + fuzzy matching.
// Kept as a plain class separate from the Cordis service: Cordis hands consumers
// `Object.create(service)` proxies, so mutable state must live in a shared object
// rather than in `#private` fields or properties reassigned on the service.
import MiniSearch from 'minisearch'
import type { IndexService, NoteRecord, SearchHit, VaultPath, VaultService } from '@diabase/protocol'
import { buildSnippets, processTerm, splitFrontmatter, tokenize } from './text.ts'

interface Doc {
  id: VaultPath
  title: string
  aliases: string
  tags: string
  body: string
}

interface Meta {
  title: string
  aliases: string[]
  tags: string[]
  body: string
  lineOffset: number
}

export interface SearchOptions {
  limit?: number
  folder?: VaultPath
  tag?: string
}

const DEFAULT_LIMIT = 50
const BATCH = 16

export class SearchEngine {
  readonly meta = new Map<VaultPath, Meta>()
  private readonly mini = new MiniSearch<Doc>({
    fields: ['title', 'aliases', 'tags', 'body'],
    tokenize,
    processTerm,
  })
  private chain: Promise<void> = Promise.resolve()
  private stopped = false

  constructor(
    private readonly vault: Pick<VaultService, 'list' | 'read'>,
    private readonly index: Pick<IndexService, 'ready' | 'get'>,
    private readonly onError: (error: unknown) => void = () => {},
  ) {}

  stop(): void {
    this.stopped = true
  }

  /** Runs `task` after everything queued so far; failures are reported, never break the chain. */
  private enqueue(task: () => Promise<void>): Promise<void> {
    const run = this.chain.then(async () => {
      if (this.stopped) return
      try {
        await task()
      } catch (error) {
        this.onError(error)
      }
    })
    this.chain = run
    return run
  }

  build(): Promise<void> {
    return this.enqueue(async () => {
      await this.index.ready()
      const entries = await this.vault.list('', { recursive: true, extensions: ['.md'] })
      const paths = entries
        .filter((e) => e.kind === 'file' && !e.path.startsWith('.diabase/'))
        .map((e) => e.path)
      await this.refresh(paths)
    })
  }

  update(paths: VaultPath[]): Promise<void> {
    return this.enqueue(() => this.refresh(paths))
  }

  /** Resolves once every queued build/update has been applied. */
  idle(): Promise<void> {
    return this.chain
  }

  private async refresh(paths: VaultPath[]): Promise<void> {
    for (let i = 0; i < paths.length; i += BATCH) {
      const batch = paths.slice(i, i + BATCH)
      const loaded = await Promise.all(batch.map((path) => this.load(path)))
      if (this.stopped) return
      batch.forEach((path, j) => this.put(path, loaded[j] ?? null))
    }
  }

  private async load(path: VaultPath): Promise<{ record: NoteRecord; content: string } | null> {
    if (path.startsWith('.diabase/')) return null
    try {
      const record = await this.index.get(path)
      if (!record) return null
      const { content } = await this.vault.read(path)
      return { record, content }
    } catch (error) {
      // Deleted between the event and the read (ENOENT) is normal; anything else is reported.
      if ((error as { code?: string } | null)?.code !== 'ENOENT') this.onError(error)
      return null
    }
  }

  private put(path: VaultPath, loaded: { record: NoteRecord; content: string } | null): void {
    if (this.mini.has(path)) this.mini.discard(path)
    if (!loaded) {
      this.meta.delete(path)
      return
    }
    const { record, content } = loaded
    const { body, lineOffset } = splitFrontmatter(content)
    this.meta.set(path, { title: record.title, aliases: record.aliases, tags: record.tags, body, lineOffset })
    this.mini.add({
      id: path,
      title: record.title,
      aliases: record.aliases.join(' '),
      tags: record.tags.join(' '),
      body,
    })
  }

  async search(text: string, options: SearchOptions = {}): Promise<SearchHit[]> {
    await this.chain
    if (tokenize(text).length === 0) return []
    const folder = normalizeFolder(options.folder)
    const tag = options.tag?.replace(/^#/, '').toLowerCase()
    const results = this.mini.search(text, {
      prefix: true,
      fuzzy: 0.2,
      boost: { title: 3, aliases: 2, tags: 1.5, body: 1 },
      filter: (r) => {
        const path = r.id as VaultPath
        if (folder && path !== folder && !path.startsWith(`${folder}/`)) return false
        if (tag) {
          const tags = this.meta.get(path)?.tags ?? []
          if (!tags.some((t) => matchesTag(t, tag))) return false
        }
        return true
      },
    })
    results.sort((a, b) => b.score - a.score || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0))
    const limit = options.limit ?? DEFAULT_LIMIT
    return results.slice(0, Math.max(0, limit)).map((r) => {
      const path = r.id as VaultPath
      const meta = this.meta.get(path)
      return {
        path,
        title: meta?.title ?? path,
        score: r.score,
        snippets: meta ? buildSnippets(meta.body, meta.lineOffset, new Set(r.terms)) : [],
      }
    })
  }
}

function normalizeFolder(folder: string | undefined): string {
  return (folder ?? '').replace(/^\/+|\/+$/g, '')
}

/** `tag: 'a'` matches `a` and nested `a/b`. */
function matchesTag(noteTag: string, wanted: string): boolean {
  const t = noteTag.toLowerCase()
  return t === wanted || t.startsWith(`${wanted}/`)
}
