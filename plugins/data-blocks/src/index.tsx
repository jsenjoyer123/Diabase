import React, { type FC } from 'react'
import type { Context } from '@diabase/kernel'
import type { BlockDefinition, BlockProps } from '@diabase/protocol'
import { Cards, Chart, Stat, Table } from '@diabase/ui'
import { useBlockContext } from '@diabase/plugin-blocks'

// Sample books dataset from sample vault
const SAMPLE_VAULT_BOOKS = [
  { title: 'Dune', author: 'Frank Herbert', rating: 5, genre: 'Sci-Fi', status: 'finished', path: 'Books/Dune.md' },
  { title: 'Neuromancer', author: 'William Gibson', rating: 5, genre: 'Cyberpunk', status: 'finished', path: 'Books/Neuromancer.md' },
  { title: 'Snow Crash', author: 'Neal Stephenson', rating: 4, genre: 'Cyberpunk', status: 'finished', path: 'Books/Snow Crash.md' },
  { title: 'Hyperion', author: 'Dan Simmons', rating: 5, genre: 'Sci-Fi', status: 'finished', path: 'Books/Hyperion.md' },
  { title: 'Foundation', author: 'Isaac Asimov', rating: 4, genre: 'Sci-Fi', status: 'finished', path: 'Books/Foundation.md' },
  { title: 'The Left Hand of Darkness', author: 'Ursula K. Le Guin', rating: 5, genre: 'Sci-Fi', status: 'reading', path: 'Books/The Left Hand of Darkness.md' },
]

// 1. core/cards: Vault Notes Cards Block
export const VaultCardsBlock: FC<BlockProps<{ title?: string; folder?: string }>> = ({ props }) => {
  const { setActiveNotePath } = useBlockContext()

  const cardItems = SAMPLE_VAULT_BOOKS.map((b) => ({
    id: b.path,
    title: b.title,
    subtitle: `by ${b.author}`,
    description: `Genre: ${b.genre} · Status: ${b.status}`,
    badge: `★ ${b.rating}`,
    tags: [b.genre, b.status],
    metrics: [{ label: 'Rating', value: `${b.rating} / 5` }],
  }))

  return (
    <div style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
      <div
        onClick={(e) => {
          const target = (e.target as HTMLElement).closest('[data-id]')
          if (target && setActiveNotePath) {
            const path = target.getAttribute('data-id')
            if (path) setActiveNotePath(path)
          }
        }}
      >
        <Cards title={props.title || 'Vault Notes Gallery'} columns={2} items={cardItems} />
      </div>
    </div>
  )
}

// 2. core/table: Vault Notes Table Block
export const VaultTableBlock: FC<BlockProps<{ title?: string }>> = ({ props }) => {
  const { setActiveNotePath } = useBlockContext()

  return (
    <div style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
      <Table
        title={props.title || 'Vault Data Table'}
        columns={[
          { key: 'title', label: 'Book Title', type: 'text' },
          { key: 'author', label: 'Author', type: 'text' },
          { key: 'genre', label: 'Genre', type: 'badge' },
          { key: 'rating', label: 'Rating', type: 'number', align: 'center' },
          { key: 'status', label: 'Status', type: 'badge' },
        ]}
        rows={SAMPLE_VAULT_BOOKS}
        searchable={true}
        pagination={true}
        pageSize={5}
      />
    </div>
  )
}

// 3. core/chart: Vault Data Chart Block
export const VaultChartBlock: FC<BlockProps<{ title?: string; type?: 'donut' | 'bar' }>> = ({ props }) => {
  const ratingsCount: Record<string, number> = { '5 Stars': 0, '4 Stars': 0, '3 Stars': 0 }
  SAMPLE_VAULT_BOOKS.forEach((b) => {
    const key = `${b.rating} Stars`
    ratingsCount[key] = (ratingsCount[key] || 0) + 1
  })

  const chartData = Object.entries(ratingsCount).map(([label, value]) => ({
    label,
    value,
    subtext: `${value} books`,
  }))

  return (
    <div style={{ padding: '1rem', height: '100%', overflowY: 'auto' }}>
      <Chart
        type={props.type || 'donut'}
        title={props.title || 'Books Rating Breakdown'}
        subtitle="Distribution of ratings across reading list"
        data={chartData}
        unit="books"
      />
    </div>
  )
}

// 4. core/stat: Vault Metric Stat Block
export const VaultStatBlock: FC<BlockProps<{ label?: string; value?: string | number }>> = ({ props }) => {
  return (
    <div style={{ padding: '0.75rem', height: '100%' }}>
      <Stat
        label={props.label || 'Total Books Read'}
        value={props.value || SAMPLE_VAULT_BOOKS.length}
        subtext="Average rating: 4.7"
        delta={{ value: '+2', trend: 'up', label: 'this month' }}
        icon="book"
        color="primary"
      />
    </div>
  )
}

export const VaultCardsDefinition: BlockDefinition<any> = {
  manifest: {
    type: 'core/cards',
    title: 'Note Cards Gallery',
    description: 'Visual grid of notes with tags and metrics',
    version: '0.1.0',
    data: { query: 'optional', note: 'none', writes: [] },
  },
  component: VaultCardsBlock,
}

export const VaultTableDefinition: BlockDefinition<any> = {
  manifest: {
    type: 'core/table',
    title: 'Data Table',
    description: 'Filterable, sortable table of vault notes and frontmatter properties',
    version: '0.1.0',
    data: { query: 'optional', note: 'none', writes: [] },
  },
  component: VaultTableBlock,
}

export const VaultChartDefinition: BlockDefinition<any> = {
  manifest: {
    type: 'core/chart',
    title: 'Data Chart',
    description: 'Donut and bar charts of aggregated frontmatter fields',
    version: '0.1.0',
    data: { query: 'optional', note: 'none', writes: [] },
  },
  component: VaultChartBlock,
}

export const VaultStatDefinition: BlockDefinition<any> = {
  manifest: {
    type: 'core/stat',
    title: 'Metric Card',
    description: 'Prominent statistic or KPI card',
    version: '0.1.0',
    data: { query: 'optional', note: 'none', writes: [] },
  },
  component: VaultStatBlock,
}

export default function apply(ctx: Context) {
  if (ctx.blocks) {
    ctx.blocks.define(VaultCardsDefinition)
    ctx.blocks.define(VaultTableDefinition)
    ctx.blocks.define(VaultChartDefinition)
    ctx.blocks.define(VaultStatDefinition)
  }
}
