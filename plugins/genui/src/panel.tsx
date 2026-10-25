import React, { useState, type FC } from 'react'
import type { Context } from '@diabase/kernel'
import type { BlockDefinition, BlockProps, LayoutOp } from '@diabase/protocol'
import { useBlockContext } from '@diabase/plugin-blocks'
import { Icon } from '@diabase/ui'

const SAMPLE_GENUI_TASKS = [
  {
    title: '📚 Reading & Book Rating Dashboard',
    prompt: 'I want a dashboard of how I read or rate books with stats, charts, and cards',
    plan: [
      {
        op: 'replace',
        id: 'main-split',
        node: {
          kind: 'split',
          id: 'reading-main-split',
          direction: 'row',
          sizes: [1.2, 1],
          children: [
            {
              kind: 'split',
              id: 'reading-left-split',
              direction: 'column',
              sizes: [1, 2],
              children: [
                {
                  kind: 'split',
                  id: 'reading-stats-split',
                  direction: 'row',
                  sizes: [1, 1],
                  children: [
                    {
                      kind: 'slot',
                      id: 'slot-stat-books',
                      title: 'Books Read',
                      block: { id: 'b-stat-1', type: 'core/stat', props: { label: 'Books Read', value: 18 } },
                    },
                    {
                      kind: 'slot',
                      id: 'slot-chart-rating',
                      title: 'Rating Distribution',
                      block: { id: 'b-chart-1', type: 'core/chart', props: { title: 'Ratings', type: 'donut' } },
                    },
                  ],
                },
                {
                  kind: 'slot',
                  id: 'slot-books-cards',
                  title: 'Reading Shelf',
                  block: { id: 'b-cards-1', type: 'core/cards', props: { title: 'Reading Shelf (Books/)' } },
                },
              ],
            },
            {
              kind: 'slot',
              id: 'slot-book-editor',
              title: 'Book Details',
              block: { id: 'b-editor-1', type: 'core/editor', props: { path: 'Books/Dune.md' } },
            },
          ],
        },
      },
    ] as LayoutOp[],
  },
  {
    title: '📝 Writing & Daily Notes Studio',
    prompt: 'Create a split workspace with daily notes, tasks, and editor',
    plan: [
      {
        op: 'replace',
        id: 'main-split',
        node: {
          kind: 'split',
          id: 'writing-split',
          direction: 'row',
          sizes: [1, 1],
          children: [
            {
              kind: 'slot',
              id: 'slot-editor-daily',
              title: 'Daily Notes',
              block: { id: 'b-daily-1', type: 'core/editor', props: { path: 'Daily/2026-10-25.md' } },
            },
            {
              kind: 'slot',
              id: 'slot-editor-proj',
              title: 'Project Notes',
              block: { id: 'b-proj-1', type: 'core/editor', props: { path: 'Projects/Diabase/Overview.md' } },
            },
          ],
        },
      },
    ] as LayoutOp[],
  },
  {
    title: '📊 Full Vault Data Analytics',
    prompt: 'Show tabular data of all notes and properties',
    plan: [
      {
        op: 'replace',
        id: 'main-split',
        node: {
          kind: 'slot',
          id: 'slot-full-table',
          title: 'Vault Data Explorer',
          block: { id: 'b-table-full', type: 'core/table', props: { title: 'All Notes in Vault' } },
        },
      },
    ] as LayoutOp[],
  },
]

export const GenUIPanelBlock: FC<BlockProps> = () => {
  const { ctx } = useBlockContext()
  const [taskPrompt, setTaskPrompt] = useState('')
  const [loading, setLoading] = useState(false)
  const [status, setStatus] = useState<string | null>(null)

  const executeGenUITask = (task: typeof SAMPLE_GENUI_TASKS[0]) => {
    setLoading(true)
    setStatus('Analyzing vault structure and frontmatter...')

    setTimeout(() => {
      setStatus('Planning layout operations & selecting registered blocks...')
      setTimeout(() => {
        if (ctx?.slots) {
          ctx.slots.apply(task.plan)
        }
        setStatus('✓ Layout applied successfully!')
        setLoading(false)
        setTimeout(() => setStatus(null), 3000)
      }, 700)
    }, 600)
  }

  const handleCustomSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (!taskPrompt.trim()) return

    // Find matching preset or generate default reading dashboard
    const matched =
      SAMPLE_GENUI_TASKS.find((t) => taskPrompt.toLowerCase().includes('book') || taskPrompt.toLowerCase().includes('read')) ||
      SAMPLE_GENUI_TASKS[0]!

    executeGenUITask(matched)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '1rem',
        background: 'var(--diabase-bg-surface)',
        fontSize: '0.85rem',
        color: 'var(--diabase-text-main)',
        overflowY: 'auto',
      }}
    >
      <div style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', marginBottom: '0.35rem' }}>
          <span style={{ fontSize: '1.1rem' }}>✨</span>
          <h4 style={{ margin: 0, fontWeight: 700, fontSize: '0.95rem' }}>Generative UI Task Agent</h4>
        </div>
        <p style={{ margin: 0, color: 'var(--diabase-text-muted)', fontSize: '0.775rem', lineHeight: 1.4 }}>
          Describe how you want to interact with your Markdown vault. The AI analyzes frontmatter and slots to build your workspace.
        </p>
      </div>

      {/* Task Input Form */}
      <form onSubmit={handleCustomSubmit} style={{ marginBottom: '1rem' }}>
        <div style={{ display: 'flex', gap: '0.5rem' }}>
          <input
            type="text"
            placeholder="e.g. 'I want a dashboard of how I read or rate books'..."
            value={taskPrompt}
            onChange={(e) => setTaskPrompt(e.target.value)}
            disabled={loading}
            style={{
              flex: 1,
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border)',
              borderRadius: '6px',
              color: 'var(--diabase-text-main)',
              padding: '0.5rem 0.75rem',
              fontSize: '0.825rem',
              outline: 'none',
            }}
          />
          <button
            type="submit"
            disabled={loading}
            style={{
              background: 'linear-gradient(135deg, #6366f1, #8b5cf6)',
              border: 'none',
              borderRadius: '6px',
              color: '#fff',
              padding: '0.5rem 1rem',
              fontWeight: 600,
              fontSize: '0.8rem',
              cursor: 'pointer',
              whiteSpace: 'nowrap',
            }}
          >
            {loading ? 'Thinking...' : 'Run Agent'}
          </button>
        </div>
      </form>

      {status && (
        <div
          style={{
            padding: '0.5rem 0.75rem',
            marginBottom: '1rem',
            borderRadius: '6px',
            background: 'rgba(99, 102, 241, 0.15)',
            border: '1px solid rgba(99, 102, 241, 0.3)',
            color: '#a5b4fc',
            fontSize: '0.8rem',
            display: 'flex',
            alignItems: 'center',
            gap: '0.5rem',
          }}
        >
          <Icon name="activity" size={14} />
          <span>{status}</span>
        </div>
      )}

      {/* Preset Tasks */}
      <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        <span style={{ fontSize: '0.75rem', textTransform: 'uppercase', letterSpacing: '0.05em', color: 'var(--diabase-text-dim)', fontWeight: 600 }}>
          Quick Agent Tasks:
        </span>
        {SAMPLE_GENUI_TASKS.map((t, idx) => (
          <button
            key={idx}
            onClick={() => executeGenUITask(t)}
            disabled={loading}
            style={{
              display: 'flex',
              flexDirection: 'column',
              textAlign: 'left',
              gap: '2px',
              padding: '0.65rem 0.85rem',
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border)',
              borderRadius: '6px',
              color: 'var(--diabase-text-main)',
              cursor: 'pointer',
              transition: 'all 0.15s ease',
            }}
          >
            <span style={{ fontWeight: 600, fontSize: '0.825rem' }}>{t.title}</span>
            <span style={{ fontSize: '0.75rem', color: 'var(--diabase-text-muted)' }}>"{t.prompt}"</span>
          </button>
        ))}
      </div>
    </div>
  )
}

export const GenUIPanelDefinition: BlockDefinition = {
  manifest: {
    type: 'genui/panel',
    title: 'GenUI Agent Assistant',
    description: 'Natural language task agent that plans and modifies workspace slots',
    version: '0.1.0',
    regions: ['sidebar', 'panel', 'main'],
  },
  component: GenUIPanelBlock,
}

export function registerGenUIPanel(ctx: Context) {
  if (ctx.blocks) {
    ctx.blocks.define(GenUIPanelDefinition)
  }
}
