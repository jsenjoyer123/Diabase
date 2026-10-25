// Tiny in-memory `vault` and `index` services: only the methods search calls.
import { Context, Service } from '@diabase/kernel'
import type { NoteQuery, NoteRecord, QueryResult } from '@diabase/protocol'
import { SearchPlugin } from '../src/index.ts'

export interface FakeNote {
  title?: string
  tags?: string[]
  aliases?: string[]
  body: string
  mtimeMs?: number
}

export class FakeStore {
  notes = new Map<string, FakeNote>()
  reads: string[] = []
  put(path: string, note: FakeNote): void {
    this.notes.set(path, note)
  }
  remove(path: string): void {
    this.notes.delete(path)
  }
}

export function basenameTitle(path: string): string {
  return path.replace(/^.*\//, '').replace(/\.md$/, '')
}

class FakeVault extends Service {
  constructor(ctx: Context, private store: FakeStore) {
    super(ctx, 'vault')
  }
  list = async () =>
    [...this.store.notes.keys(), '.diabase/trash/old.md'].map((path) => ({
      path,
      name: path.replace(/^.*\//, ''),
      kind: 'file' as const,
    }))
  read = async (path: string) => {
    this.store.reads.push(path)
    const note = this.store.notes.get(path)
    if (!note) throw Object.assign(new Error('ENOENT'), { code: 'ENOENT', path })
    return { path, content: note.body, hash: 'sha256-x' as const, mtimeMs: note.mtimeMs ?? 0 }
  }
}

class FakeIndex extends Service {
  constructor(ctx: Context, private store: FakeStore) {
    super(ctx, 'index')
  }
  ready = async () => {}
  get = async (path: string): Promise<NoteRecord | null> => {
    const n = this.store.notes.get(path)
    if (!n) return null
    return {
      path,
      title: n.title ?? basenameTitle(path),
      tags: n.tags ?? [],
      aliases: n.aliases ?? [],
      mtimeMs: n.mtimeMs ?? 0,
    } as NoteRecord
  }
  query = async (q: NoteQuery): Promise<QueryResult> => {
    const rows = [...this.store.notes.entries()]
      .sort(([, a], [, b]) => (b.mtimeMs ?? 0) - (a.mtimeMs ?? 0))
      .slice(0, q.limit)
      .map(([path, n]) => ({ path, values: { 'file.path': path, 'file.title': n.title ?? basenameTitle(path) } }))
    return { rows, total: rows.length }
  }
}

export async function setup(notes: Record<string, FakeNote>) {
  const store = new FakeStore()
  for (const [path, note] of Object.entries(notes)) store.put(path, note)
  const root = new Context()
  await root.plugin(FakeVault, store)
  await root.plugin(FakeIndex, store)
  const fiber = root.plugin(SearchPlugin)
  await fiber
  return { root, store, fiber, search: root.search }
}
