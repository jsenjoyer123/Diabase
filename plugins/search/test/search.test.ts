import { describe, expect, it } from 'vitest'
import { setup } from './fakes.ts'

const NOTES = {
  'Books/Dune.md': {
    title: 'Dune',
    tags: ['book', 'scifi/classic'],
    aliases: ['Arrakis saga'],
    body: '---\ntitle: Dune\n---\n# Dune\nA desert planet.\nThe spice must flow on Arrakis.\n',
  },
  'Journal/2026-01-01.md': {
    tags: ['journal'],
    body: '# Day\nRead about dune buggies today.\nSpice rack organised.\n',
  },
  'Projects/Roadmap.md': {
    tags: ['project'],
    body: '# Roadmap\nShip the search plugin. Search is fuzzy.\n',
  },
  'Projects/Search.md': {
    tags: ['project', 'scifi'],
    body: '# Search\nNotes about the roadmap.\n',
  },
}

describe('search', () => {
  it('ranks title and alias matches above body matches, ties by path', async () => {
    const { search } = await setup(NOTES)
    const hits = await search.search('dune')
    expect(hits.map((h) => h.path)).toEqual(['Books/Dune.md', 'Journal/2026-01-01.md'])
    expect(hits[0]!.title).toBe('Dune')
    expect(hits[0]!.score).toBeGreaterThan(hits[1]!.score)

    const alias = await search.search('arrakis saga')
    expect(alias[0]!.path).toBe('Books/Dune.md')

    // 'roadmap' is the title of Roadmap.md but only body text in Search.md
    const road = await search.search('roadmap')
    expect(road.map((h) => h.path)).toEqual(['Projects/Roadmap.md', 'Projects/Search.md'])
  })

  it('supports prefix and fuzzy matching, and empty queries return nothing', async () => {
    const { search } = await setup(NOTES)
    expect((await search.search('arra'))[0]!.path).toBe('Books/Dune.md')
    expect((await search.search('roadmop')).map((h) => h.path)).toContain('Projects/Roadmap.md')
    expect(await search.search('  ')).toEqual([])
    expect(await search.search('zzzzqqq')).toEqual([])
  })

  it('orders equal scores by path and honours limit', async () => {
    const { search } = await setup({
      'b.md': { title: 'Same', body: 'x' },
      'a.md': { title: 'Same', body: 'x' },
      'c.md': { title: 'Same', body: 'x' },
    })
    expect((await search.search('same')).map((h) => h.path)).toEqual(['a.md', 'b.md', 'c.md'])
    expect((await search.search('same', { limit: 2 })).map((h) => h.path)).toEqual(['a.md', 'b.md'])
  })

  it('returns up to 3 matching lines with 1-based line numbers and match ranges', async () => {
    const { search } = await setup(NOTES)
    const [dune] = await search.search('spice arrakis')
    expect(dune!.path).toBe('Books/Dune.md')
    // frontmatter occupies lines 1-3, so the body line is line 6 in the file
    expect(dune!.snippets).toEqual([{ line: 6, text: 'The spice must flow on Arrakis.', ranges: [[4, 9], [23, 30]] }])
    for (const s of dune!.snippets) {
      expect(s.ranges.map(([a, b]) => s.text.slice(a, b).toLowerCase())).toEqual(['spice', 'arrakis'])
    }

    const many = await setup({
      'n.md': { body: 'cat one\nnothing\ncat two cat\ncat three\ncat four\n' },
    })
    const [hit] = await many.search.search('cat')
    expect(hit!.snippets.length).toBe(3)
    // the line with the most matches wins a slot; lines come out in document order
    expect(hit!.snippets.map((s) => s.line)).toEqual([1, 3, 4])
    expect(hit!.snippets[1]!.ranges).toEqual([[0, 3], [8, 11]])
  })

  it('filters by folder and tag', async () => {
    const { search } = await setup(NOTES)
    expect((await search.search('search', { folder: 'Projects' })).map((h) => h.path)).toEqual([
      'Projects/Search.md',
      'Projects/Roadmap.md',
    ])
    expect(await search.search('dune', { folder: 'Proj' })).toEqual([])
    expect((await search.search('dune', { folder: 'Books/' })).map((h) => h.path)).toEqual(['Books/Dune.md'])
    expect((await search.search('roadmap', { tag: 'scifi' })).map((h) => h.path)).toEqual(['Projects/Search.md'])
    // nested tags match their parent; a leading # is ignored
    expect((await search.search('dune', { tag: '#scifi' })).map((h) => h.path)).toEqual(['Books/Dune.md'])
    expect(await search.search('dune', { tag: 'scifi/other' })).toEqual([])
  })

  it('indexes incrementally on index/updated, including deletes', async () => {
    const { root, store, search } = await setup(NOTES)
    expect(await search.search('tardigrade')).toEqual([])

    store.put('Projects/Roadmap.md', { tags: ['project'], body: '# Roadmap\nTardigrade support.\n' })
    store.put('New.md', { body: 'a tardigrade appears' })
    root.emit('index/updated', ['Projects/Roadmap.md', 'New.md'])
    expect((await search.search('tardigrade')).map((h) => h.path).sort()).toEqual(['New.md', 'Projects/Roadmap.md'])
    expect(await search.search('ship')).toEqual([]) // old body text is gone

    store.remove('New.md')
    root.emit('index/updated', ['New.md'])
    expect((await search.search('tardigrade')).map((h) => h.path)).toEqual(['Projects/Roadmap.md'])
  })

  it('skips .diabase/ during the initial build', async () => {
    const { store, search } = await setup(NOTES)
    expect(store.reads).not.toContain('.diabase/trash/old.md')
    expect(await search.search('old')).toEqual([])
  })

  it('stops updating once the plugin is disposed', async () => {
    const { root, store, fiber, search } = await setup(NOTES)
    await fiber.dispose()
    const readsBefore = store.reads.length
    store.put('Late.md', { body: 'tardigrade' })
    root.emit('index/updated', ['Late.md'])
    expect(await search.search('tardigrade')).toEqual([])
    expect(store.reads.length).toBe(readsBefore)
  })
})
