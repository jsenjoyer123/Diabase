import { beforeEach, describe, expect, it } from 'vitest'
import { Context } from '@diabase/kernel'
import type { VaultEvent } from '@diabase/protocol'
import { VaultError, hashContent } from '../src/index.ts'
import { createMemoryVault, getMemoryVault, type MemoryVault } from '../src/testing.ts'

const SEED = {
  'Books/Dune.md': '---\ntitle: Dune\n# keep me\ntags: [scifi]\n---\n# Dune\n',
  'Books/Emma.md': '# Emma\n',
  'Books/.draft.md': 'hidden',
  'Notes/a.txt': 'plain',
  'Notes/deep/b.md': 'b',
  'root.md': 'root',
}

let ctx: Context
let vault: MemoryVault
let events: VaultEvent[]

beforeEach(async () => {
  ctx = new Context()
  await ctx.plugin(createMemoryVault(SEED))
  vault = getMemoryVault(ctx)
  events = []
  ctx.on('vault/changed', (batch) => void events.push(...batch))
})

const failure = async (promise: Promise<unknown>): Promise<VaultError> => {
  try {
    await promise
  } catch (error) {
    return error as VaultError
  }
  throw new Error('expected the promise to reject')
}

describe('read', () => {
  it('reads seeded files with a content hash', async () => {
    const file = await ctx.vault.read('root.md')
    expect(file.content).toBe('root')
    expect(file.hash).toBe(hashContent('root'))
    expect(file.path).toBe('root.md')
    expect(file.mtimeMs).toBeGreaterThan(0)
  })

  it('throws ENOENT for a missing file and EISDIR for a folder', async () => {
    const missing = await failure(ctx.vault.read('nope.md'))
    expect(missing).toBeInstanceOf(VaultError)
    expect(missing).toMatchObject({ code: 'ENOENT', path: 'nope.md' })
    expect(await failure(ctx.vault.read('Books'))).toMatchObject({ code: 'EISDIR' })
  })

  it('normalizes paths and rejects escapes', async () => {
    expect((await ctx.vault.read('./Books//Emma.md')).path).toBe('Books/Emma.md')
    expect(await failure(ctx.vault.read('../x.md'))).toMatchObject({ code: 'EOUTSIDE' })
  })

  it('exists and stat', async () => {
    expect(await ctx.vault.exists('root.md')).toBe(true)
    expect(await ctx.vault.exists('Books')).toBe(true)
    expect(await ctx.vault.exists('nope')).toBe(false)
    expect(await ctx.vault.stat('root.md')).toMatchObject({ kind: 'file', name: 'root.md', size: 4 })
    expect(await ctx.vault.stat('Books')).toMatchObject({ kind: 'dir', name: 'Books' })
    expect(await ctx.vault.stat('nope')).toBeNull()
  })

  it('round-trips binary data', async () => {
    const bytes = new Uint8Array([0, 1, 2, 255])
    expect(await ctx.vault.writeBinary('img/a.bin', bytes)).toEqual({ ok: true, hash: hashContent(bytes) })
    bytes[0] = 9
    expect([...(await ctx.vault.readBinary('img/a.bin'))]).toEqual([0, 1, 2, 255])
    expect([...(await ctx.vault.readBinary('root.md'))]).toEqual([...new TextEncoder().encode('root')])
  })
})

describe('write', () => {
  it('writes unconditionally when baseHash is undefined', async () => {
    const result = await ctx.vault.write('root.md', 'new')
    expect(result).toEqual({ ok: true, hash: hashContent('new') })
    expect((await ctx.vault.read('root.md')).content).toBe('new')
  })

  it('creates parent folders', async () => {
    await ctx.vault.write('x/y/z.md', 'z')
    expect(await ctx.vault.stat('x/y')).toMatchObject({ kind: 'dir' })
  })

  it('accepts a matching baseHash and rejects a stale one with the current hash', async () => {
    const { hash } = await ctx.vault.read('root.md')
    expect(await ctx.vault.write('root.md', 'v2', { baseHash: hash })).toEqual({ ok: true, hash: hashContent('v2') })
    expect(await ctx.vault.write('root.md', 'v3', { baseHash: hash })).toEqual({
      ok: false,
      reason: 'conflict',
      currentHash: hashContent('v2'),
    })
    expect((await ctx.vault.read('root.md')).content).toBe('v2')
  })

  it('baseHash null creates only when the file is missing', async () => {
    expect(await ctx.vault.write('fresh.md', 'one', { baseHash: null })).toEqual({ ok: true, hash: hashContent('one') })
    expect(await ctx.vault.write('fresh.md', 'two', { baseHash: null })).toEqual({
      ok: false,
      reason: 'conflict',
      currentHash: hashContent('one'),
    })
    expect((await ctx.vault.read('fresh.md')).content).toBe('one')
  })

  it('a hash baseHash on a missing file is a conflict with currentHash null', async () => {
    expect(await ctx.vault.write('ghost.md', 'x', { baseHash: hashContent('y') })).toEqual({
      ok: false,
      reason: 'conflict',
      currentHash: null,
    })
    expect(await ctx.vault.exists('ghost.md')).toBe(false)
  })

  it('refuses to write over a folder or through a file', async () => {
    expect(await failure(ctx.vault.write('Books', 'x'))).toMatchObject({ code: 'EISDIR' })
    expect(await failure(ctx.vault.write('root.md/child.md', 'x'))).toMatchObject({ code: 'ENOTDIR' })
  })

  it('mkdir creates an empty folder', async () => {
    await ctx.vault.mkdir('Empty/Sub')
    expect(await ctx.vault.stat('Empty/Sub')).toMatchObject({ kind: 'dir' })
    await ctx.vault.mkdir('Empty/Sub')
    expect(await failure(ctx.vault.mkdir('root.md'))).toMatchObject({ code: 'EEXIST' })
  })
})

describe('list', () => {
  const paths = (entries: Array<{ path: string }>) => entries.map((e) => e.path)

  it('lists the immediate children of the root, folders included, hidden skipped', async () => {
    const entries = await ctx.vault.list()
    expect(paths(entries)).toEqual(['Books', 'Notes', 'root.md'])
    expect(entries.map((e) => e.kind)).toEqual(['dir', 'dir', 'file'])
  })

  it('lists a folder non-recursively', async () => {
    expect(paths(await ctx.vault.list('Notes'))).toEqual(['Notes/a.txt', 'Notes/deep'])
  })

  it('lists recursively', async () => {
    expect(paths(await ctx.vault.list('', { recursive: true }))).toEqual([
      'Books',
      'Books/Dune.md',
      'Books/Emma.md',
      'Notes',
      'Notes/a.txt',
      'Notes/deep',
      'Notes/deep/b.md',
      'root.md',
    ])
  })

  it('includes hidden entries on request', async () => {
    expect(paths(await ctx.vault.list('Books', { includeHidden: true }))).toContain('Books/.draft.md')
    expect(paths(await ctx.vault.list('Books'))).not.toContain('Books/.draft.md')
  })

  it('filters files by extension and keeps folders', async () => {
    expect(paths(await ctx.vault.list('Notes', { recursive: true, extensions: ['.md'] }))).toEqual([
      'Notes/deep',
      'Notes/deep/b.md',
    ])
  })

  it('reports file size and times, ENOENT for missing and ENOTDIR for files', async () => {
    const [entry] = await ctx.vault.list('Notes/deep')
    expect(entry).toMatchObject({ name: 'b.md', kind: 'file', size: 1 })
    expect(entry?.mtimeMs).toBeGreaterThan(0)
    expect(await failure(ctx.vault.list('nope'))).toMatchObject({ code: 'ENOENT' })
    expect(await failure(ctx.vault.list('root.md'))).toMatchObject({ code: 'ENOTDIR' })
  })
})

describe('rename', () => {
  it('moves a file', async () => {
    await ctx.vault.rename('root.md', 'Books/root.md')
    expect(await ctx.vault.exists('root.md')).toBe(false)
    expect((await ctx.vault.read('Books/root.md')).content).toBe('root')
  })

  it('moves a folder with its contents', async () => {
    await ctx.vault.rename('Notes', 'Archive/Notes')
    expect((await ctx.vault.read('Archive/Notes/deep/b.md')).content).toBe('b')
    expect(await ctx.vault.exists('Notes')).toBe(false)
    expect(await ctx.vault.exists('Notes/a.txt')).toBe(false)
  })

  it('refuses to overwrite (EEXIST) and reports ENOENT', async () => {
    expect(await failure(ctx.vault.rename('root.md', 'Books/Emma.md'))).toMatchObject({ code: 'EEXIST' })
    expect(await failure(ctx.vault.rename('root.md', 'Books'))).toMatchObject({ code: 'EEXIST' })
    expect(await failure(ctx.vault.rename('nope.md', 'x.md'))).toMatchObject({ code: 'ENOENT' })
    expect((await ctx.vault.read('root.md')).content).toBe('root')
  })

  it('refuses to move a folder into itself', async () => {
    expect(await failure(ctx.vault.rename('Notes', 'Notes/inner'))).toMatchObject({ code: 'EINVALIDPATH' })
  })
})

describe('delete', () => {
  it('moves to .diabase/trash by default', async () => {
    await ctx.vault.delete('Books/Emma.md')
    expect(await ctx.vault.exists('Books/Emma.md')).toBe(false)
    expect((await ctx.vault.read('.diabase/trash/Books/Emma.md')).content).toBe('# Emma\n')
    expect(vault.files.has('.diabase/trash/Books/Emma.md')).toBe(true)
  })

  it('does not overwrite an earlier trashed file of the same name', async () => {
    await ctx.vault.delete('root.md')
    await ctx.vault.write('root.md', 'again')
    await ctx.vault.delete('root.md')
    expect((await ctx.vault.read('.diabase/trash/root.md')).content).toBe('root')
    expect((await ctx.vault.read('.diabase/trash/root 2.md')).content).toBe('again')
  })

  it('trashes whole folders', async () => {
    await ctx.vault.delete('Notes')
    expect((await ctx.vault.read('.diabase/trash/Notes/deep/b.md')).content).toBe('b')
    expect(await ctx.vault.exists('Notes')).toBe(false)
  })

  it('removes permanently on request, and for files already in the trash', async () => {
    await ctx.vault.delete('root.md', { permanent: true })
    expect(await ctx.vault.exists('.diabase/trash/root.md')).toBe(false)
    await ctx.vault.delete('Books/Emma.md')
    await ctx.vault.delete('.diabase/trash/Books/Emma.md')
    expect(vault.files.has('.diabase/trash/Books/Emma.md')).toBe(false)
  })

  it('throws ENOENT for a missing path', async () => {
    expect(await failure(ctx.vault.delete('nope.md'))).toMatchObject({ code: 'ENOENT' })
  })
})

describe('frontmatter', () => {
  it('readNote parses frontmatter and body', async () => {
    const note = await ctx.vault.readNote('Books/Dune.md')
    expect(note.frontmatter).toEqual({ title: 'Dune', tags: ['scifi'] })
    expect(note.body).toBe('# Dune\n')
    expect(note.hash).toBe(hashContent(SEED['Books/Dune.md']))
  })

  it('readNote yields {} without frontmatter', async () => {
    expect(await ctx.vault.readNote('Books/Emma.md')).toMatchObject({ frontmatter: {}, body: '# Emma\n' })
  })

  it('sets and deletes keys while preserving comments and the body', async () => {
    const result = await ctx.vault.updateFrontmatter('Books/Dune.md', [
      { op: 'set', key: 'rating', value: 5 },
      { op: 'set', key: 'title', value: 'Dune Messiah' },
      { op: 'set', key: ['tags', 1], value: 'classic' },
      { op: 'delete', key: 'missing' },
    ])
    expect(result.ok).toBe(true)
    const { content } = await ctx.vault.read('Books/Dune.md')
    expect(content).toBe('---\ntitle: Dune Messiah\n# keep me\ntags: [ scifi, classic ]\nrating: 5\n---\n# Dune\n')
    await ctx.vault.updateFrontmatter('Books/Dune.md', [{ op: 'delete', key: 'rating' }, { op: 'delete', key: ['tags', 0] }])
    expect((await ctx.vault.readNote('Books/Dune.md')).frontmatter).toEqual({ title: 'Dune Messiah', tags: ['classic'] })
  })

  it('creates the block when absent, and drops all keys to an empty block', async () => {
    await ctx.vault.updateFrontmatter('Books/Emma.md', [{ op: 'set', key: 'author', value: 'Austen' }])
    expect((await ctx.vault.read('Books/Emma.md')).content).toBe('---\nauthor: Austen\n---\n# Emma\n')
    await ctx.vault.updateFrontmatter('Books/Emma.md', [{ op: 'delete', key: 'author' }])
    expect(await ctx.vault.readNote('Books/Emma.md')).toMatchObject({ frontmatter: {}, body: '# Emma\n' })
  })

  it('leaves the file untouched when there is nothing to change', async () => {
    const before = await ctx.vault.read('Books/Emma.md')
    expect(await ctx.vault.updateFrontmatter('Books/Emma.md', [{ op: 'delete', key: 'x' }])).toEqual({
      ok: true,
      hash: before.hash,
    })
    expect(events).toEqual([])
  })

  it('honors baseHash', async () => {
    const stale = hashContent('old')
    expect(await ctx.vault.updateFrontmatter('Books/Emma.md', [{ op: 'set', key: 'a', value: 1 }], { baseHash: stale })).toEqual({
      ok: false,
      reason: 'conflict',
      currentHash: hashContent(SEED['Books/Emma.md']),
    })
    const { hash } = await ctx.vault.read('Books/Emma.md')
    const ok = await ctx.vault.updateFrontmatter('Books/Emma.md', [{ op: 'set', key: 'a', value: 1 }], { baseHash: hash })
    expect(ok.ok).toBe(true)
  })

  it('throws EPARSE for invalid frontmatter and ENOENT for a missing note', async () => {
    await ctx.vault.write('bad.md', '---\n- just\n- a list\n---\nbody')
    expect(await failure(ctx.vault.updateFrontmatter('bad.md', [{ op: 'set', key: 'a', value: 1 }]))).toMatchObject({
      code: 'EPARSE',
    })
    expect((await ctx.vault.read('bad.md')).content).toBe('---\n- just\n- a list\n---\nbody')
    expect(await failure(ctx.vault.updateFrontmatter('nope.md', []))).toMatchObject({ code: 'ENOENT' })
  })
})

describe('vault/changed events', () => {
  it('emits add then change for self writes', async () => {
    await ctx.vault.write('new.md', 'one')
    await ctx.vault.write('new.md', 'two')
    expect(events).toEqual([
      { type: 'add', path: 'new.md', kind: 'file', origin: 'self' },
      { type: 'change', path: 'new.md', hash: hashContent('two'), origin: 'self' },
    ])
  })

  it('emits one single-event batch per mutation', async () => {
    const batches: VaultEvent[][] = []
    ctx.on('vault/changed', (batch) => void batches.push(batch))
    await ctx.vault.write('a.md', '1')
    await ctx.vault.mkdir('Folder')
    await ctx.vault.rename('a.md', 'b.md')
    await ctx.vault.delete('b.md')
    expect(batches.map((b) => b.length)).toEqual([1, 1, 1, 1])
    expect(batches.flat()).toEqual([
      { type: 'add', path: 'a.md', kind: 'file', origin: 'self' },
      { type: 'add', path: 'Folder', kind: 'dir', origin: 'self' },
      { type: 'rename', from: 'a.md', to: 'b.md', origin: 'self' },
      { type: 'unlink', path: 'b.md', kind: 'file', origin: 'self' },
    ])
  })

  it('emits unlink with the folder kind, and for permanent deletes', async () => {
    await ctx.vault.delete('Notes')
    await ctx.vault.delete('root.md', { permanent: true })
    expect(events).toEqual([
      { type: 'unlink', path: 'Notes', kind: 'dir', origin: 'self' },
      { type: 'unlink', path: 'root.md', kind: 'file', origin: 'self' },
    ])
  })

  it('emits a change for frontmatter updates', async () => {
    await ctx.vault.updateFrontmatter('Books/Emma.md', [{ op: 'set', key: 'a', value: 1 }])
    const { hash } = await ctx.vault.read('Books/Emma.md')
    expect(events).toEqual([{ type: 'change', path: 'Books/Emma.md', hash, origin: 'self' }])
  })

  it('does not emit for conflicts or failed operations', async () => {
    await ctx.vault.write('root.md', 'x', { baseHash: hashContent('stale') })
    await failure(ctx.vault.rename('root.md', 'Books/Emma.md'))
    await failure(ctx.vault.delete('nope.md'))
    expect(events).toEqual([])
  })

  it('external helpers mutate the store and emit with origin external', async () => {
    const { external } = vault
    external.write('root.md', 'edited elsewhere')
    external.write('made.md', 'new')
    external.rename('made.md', 'Books/made.md')
    external.delete('Books/made.md')
    expect((await ctx.vault.read('root.md')).content).toBe('edited elsewhere')
    expect(await ctx.vault.exists('Books/made.md')).toBe(false)
    expect(vault.files.has('.diabase/trash/Books/made.md')).toBe(false)
    expect(events).toEqual([
      { type: 'change', path: 'root.md', hash: hashContent('edited elsewhere'), origin: 'external' },
      { type: 'add', path: 'made.md', kind: 'file', origin: 'external' },
      { type: 'rename', from: 'made.md', to: 'Books/made.md', origin: 'external' },
      { type: 'unlink', path: 'Books/made.md', kind: 'file', origin: 'external' },
    ])
  })

  it('an external edit makes a held hash stale', async () => {
    const { hash } = await ctx.vault.read('root.md')
    vault.external.write('root.md', 'theirs')
    expect(await ctx.vault.write('root.md', 'mine', { baseHash: hash })).toEqual({
      ok: false,
      reason: 'conflict',
      currentHash: hashContent('theirs'),
    })
  })
})

describe('plugin', () => {
  it('provides the vault service and info()', async () => {
    expect(await ctx.vault.info()).toMatchObject({ name: expect.any(String), id: expect.any(String) })
  })

  it('a dependent plugin sees events emitted by the vault', async () => {
    const seen: string[] = []
    await ctx.plugin({
      name: 'consumer',
      inject: ['vault'],
      apply(inner: Context) {
        inner.on('vault/changed', (batch) => void seen.push(...batch.map((e) => e.type)))
      },
    })
    await ctx.vault.write('seen.md', 'x')
    expect(seen).toEqual(['add'])
  })
})
