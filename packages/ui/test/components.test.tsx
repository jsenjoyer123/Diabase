// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import {
  COMPONENT_REGISTRY,
  hasComponent,
  Stat,
  Table,
  List,
  Cards,
  Chart,
  TagCloud,
  Graph,
  CodeViewer,
  Markdown,
  Grid,
  Section,
  Callout,
  Badge,
} from '../src/index.ts'

describe('@diabase/ui Component Catalog', () => {
  it('registers all 13 components in COMPONENT_REGISTRY', () => {
    const expected = [
      'Stat',
      'Table',
      'List',
      'Cards',
      'Chart',
      'TagCloud',
      'Graph',
      'CodeViewer',
      'Markdown',
      'Grid',
      'Section',
      'Callout',
      'Badge',
    ]

    for (const name of expected) {
      expect(hasComponent(name)).toBe(true)
      expect(COMPONENT_REGISTRY[name as keyof typeof COMPONENT_REGISTRY]).toBeDefined()
    }
  })

  it('renders Stat component to HTML', () => {
    const html = renderToString(
      createElement(Stat, {
        label: 'Lines of Code',
        value: '42,000',
        subtext: 'across 120 files',
        delta: { value: '+5%', trend: 'up' },
        icon: 'code',
      }),
    )
    expect(html).toContain('Lines of Code')
    expect(html).toContain('42,000')
    expect(html).toContain('▲')
    expect(html).toContain('+5%')
  })

  it('renders Table component with sorting and rows', () => {
    const html = renderToString(
      createElement(Table, {
        title: 'Top Files',
        columns: [
          { key: 'file', label: 'File' },
          { key: 'size', label: 'Size', type: 'bytes' },
        ],
        rows: [
          { file: 'index.ts', size: 1024 },
          { file: 'loader.ts', size: 4096 },
        ],
      }),
    )
    expect(html).toContain('Top Files')
    expect(html).toContain('index.ts')
    expect(html).toContain('1.0 KB')
    expect(html).toContain('4.0 KB')
  })

  it('renders Chart component in donut and bar modes', () => {
    const donutHtml = renderToString(
      createElement(Chart, {
        type: 'donut',
        title: 'Languages',
        data: [
          { label: 'TypeScript', value: 80 },
          { label: 'Markdown', value: 20 },
        ],
      }),
    )
    expect(donutHtml).toContain('Languages')
    expect(donutHtml).toContain('TypeScript')

    const barHtml = renderToString(
      createElement(Chart, {
        type: 'bar',
        title: 'Commits by Author',
        data: [{ label: 'Ivan', value: 45 }],
      }),
    )
    expect(barHtml).toContain('Commits by Author')
    expect(barHtml).toContain('Ivan')
  })

  it('renders Graph component with nodes and edges', () => {
    const html = renderToString(
      createElement(Graph, {
        title: 'Module Relations',
        nodes: [
          { id: 'a', label: 'Module A' },
          { id: 'b', label: 'Module B' },
        ],
        edges: [{ source: 'a', target: 'b', label: 'depends' }],
      }),
    )
    expect(html).toContain('Module Relations')
    expect(html).toContain('Module A')
    expect(html).toContain('Module B')
    expect(html).toContain('depends')
  })

  it('renders Markdown component', () => {
    const html = renderToString(
      createElement(Markdown, {
        title: 'README',
        content: '# Hello\nThis is **bold** text and `code`.',
      }),
    )
    expect(html).toContain('README')
    expect(html).toContain('Hello')
    expect(html).toContain('bold')
    expect(html).toContain('code')
  })

  it('renders Grid and Section containers with children', () => {
    const html = renderToString(
      createElement(
        Section,
        { title: 'Overview Section', badge: 'Active' },
        createElement(
          Grid,
          { columns: 2 },
          createElement(Badge, { text: 'Child 1', color: 'success' }),
          createElement(Callout, { kind: 'tip', title: 'Tip', message: 'All good' }),
        ),
      ),
    )
    expect(html).toContain('Overview Section')
    expect(html).toContain('Active')
    expect(html).toContain('Child 1')
    expect(html).toContain('All good')
  })
})
