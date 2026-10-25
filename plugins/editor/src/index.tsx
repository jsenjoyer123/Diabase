import React, { useState, useEffect, type FC } from 'react'
import type { Context } from '@diabase/kernel'
import type { BlockDefinition, BlockProps } from '@diabase/protocol'
import { useBlockContext } from '@diabase/plugin-blocks'
import { Markdown, Icon } from '@diabase/ui'

export interface EditorProps {
  path?: string
  content?: string
  readOnly?: boolean
}

const SAMPLE_NOTES: Record<string, string> = {
  'Welcome.md': `---
title: Welcome to Diabase
date: 2026-10-25
tags: [welcome, guide]
---

# Welcome to Diabase

A **Markdown-native**, everything-is-a-plugin desktop knowledge base with a **Generative UI** block engine.

- **Everything is a Plugin**: Every slot, editor, viewer, and panel is a Cordis disposable fiber.
- **DeepSeek Harness Style Slots**: Flexible splits, tabs, grids, and overlays.
- **Generative UI**: AI analyzes your notes and assembles custom dashboards on the fly!
`,
  'Books/Dune.md': `---
title: Dune
author: Frank Herbert
rating: 5
genre: Sci-Fi
status: finished
finished: 2026-03-15
tags: [books, scifi, classic]
---

# Dune

Set on the desert planet Arrakis, Dune is the story of the boy Paul Atreides, heir to a noble family tasked with ruling an inhospitable world where the only thing of value is the "spice" melange.

## Key Themes
- Ecology and planetary systems
- Politics, power, and feudal intrigue
- Religion and prophecy
`,
  'Books/Neuromancer.md': `---
title: Neuromancer
author: William Gibson
rating: 5
genre: Cyberpunk
status: finished
tags: [books, cyberpunk]
---

# Neuromancer

The sky above the port was the color of television, tuned to a dead channel. Case is a washed-up computer hacker hired by a mysterious employer.
`,
}

export const EditorBlock: FC<BlockProps<EditorProps>> = ({ props, setProps }) => {
  const { activeNotePath } = useBlockContext()
  const notePath = activeNotePath || props.path || 'Welcome.md'

  const [mode, setMode] = useState<'split' | 'edit' | 'preview'>('split')
  const [content, setContent] = useState(
    props.content || SAMPLE_NOTES[notePath] || `# ${notePath.replace('.md', '')}\n\nStart writing notes here...`,
  )
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (SAMPLE_NOTES[notePath]) {
      setContent(SAMPLE_NOTES[notePath]!)
    }
  }, [notePath])

  // Extract frontmatter if present
  let frontmatter: Record<string, string> = {}
  let bodyContent = content
  const fmMatch = content.match(/^---\n([\s\S]*?)\n---\n([\s\S]*)$/)
  if (fmMatch) {
    const rawFm = fmMatch[1] || ''
    bodyContent = fmMatch[2] || ''
    rawFm.split('\n').forEach((line) => {
      const [k, ...v] = line.split(':')
      if (k && v.length) frontmatter[k.trim()] = v.join(':').trim()
    })
  }

  const handleSave = () => {
    setSaved(true)
    setProps({ content })
    setTimeout(() => setSaved(false), 2000)
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        background: 'var(--diabase-bg-surface)',
        color: 'var(--diabase-text-main)',
        overflow: 'hidden',
      }}
    >
      {/* Editor Header Toolbar */}
      <div
        style={{
          display: 'flex',
          alignItems: 'center',
          justifyContent: 'space-between',
          padding: '0.5rem 1rem',
          background: 'rgba(15, 23, 42, 0.85)',
          borderBottom: '1px solid var(--diabase-border)',
          fontSize: '0.85rem',
        }}
      >
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ color: 'var(--diabase-primary)', fontSize: '0.9rem' }}>📄</span>
          <span style={{ fontWeight: 600 }}>{notePath}</span>
        </div>

        <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
          {/* Mode Switcher */}
          <div
            style={{
              display: 'flex',
              background: 'var(--diabase-bg-subtle)',
              borderRadius: '4px',
              border: '1px solid var(--diabase-border)',
              padding: '2px',
            }}
          >
            {(['split', 'edit', 'preview'] as const).map((m) => (
              <button
                key={m}
                onClick={() => setMode(m)}
                style={{
                  background: mode === m ? 'var(--diabase-primary)' : 'transparent',
                  border: 'none',
                  color: mode === m ? '#fff' : 'var(--diabase-text-muted)',
                  padding: '2px 8px',
                  borderRadius: '3px',
                  fontSize: '0.75rem',
                  cursor: 'pointer',
                  textTransform: 'capitalize',
                }}
              >
                {m}
              </button>
            ))}
          </div>

          {/* Save Button */}
          <button
            onClick={handleSave}
            style={{
              background: saved ? '#10b981' : 'var(--diabase-primary)',
              border: 'none',
              color: '#fff',
              padding: '4px 10px',
              borderRadius: '4px',
              fontSize: '0.75rem',
              fontWeight: 600,
              cursor: 'pointer',
              transition: 'background 0.2s ease',
            }}
          >
            {saved ? '✓ Saved' : 'Save'}
          </button>
        </div>
      </div>

      {/* Frontmatter Properties Bar */}
      {Object.keys(frontmatter).length > 0 && (
        <div
          style={{
            display: 'flex',
            alignItems: 'center',
            gap: '1rem',
            padding: '0.4rem 1rem',
            background: 'rgba(15, 23, 42, 0.4)',
            borderBottom: '1px solid var(--diabase-border)',
            overflowX: 'auto',
            fontSize: '0.775rem',
          }}
        >
          <span style={{ color: 'var(--diabase-text-dim)', fontWeight: 600 }}>PROPERTIES:</span>
          {Object.entries(frontmatter).map(([k, v]) => (
            <div key={k} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
              <span style={{ color: 'var(--diabase-text-muted)' }}>{k}:</span>
              <span className="db-badge db-badge-primary" style={{ fontSize: '0.7rem' }}>
                {v}
              </span>
            </div>
          ))}
        </div>
      )}

      {/* Editor Content Area */}
      <div style={{ flex: 1, display: 'flex', overflow: 'hidden' }}>
        {(mode === 'edit' || mode === 'split') && (
          <div
            style={{
              flex: 1,
              height: '100%',
              overflow: 'hidden',
              display: 'flex',
              borderRight: mode === 'split' ? '1px solid var(--diabase-border)' : 'none',
            }}
          >
            <textarea
              value={content}
              onChange={(e) => setContent(e.target.value)}
              placeholder="Write Markdown here..."
              style={{
                width: '100%',
                height: '100%',
                background: 'transparent',
                border: 'none',
                color: 'var(--diabase-text-main)',
                fontFamily: 'var(--diabase-font-mono)',
                fontSize: '0.875rem',
                lineHeight: 1.6,
                padding: '1.25rem',
                outline: 'none',
                resize: 'none',
              }}
            />
          </div>
        )}

        {(mode === 'preview' || mode === 'split') && (
          <div style={{ flex: 1, height: '100%', overflowY: 'auto', padding: '1rem' }}>
            <Markdown content={bodyContent} />
          </div>
        )}
      </div>
    </div>
  )
}

export const EditorDefinition: BlockDefinition<EditorProps> = {
  manifest: {
    type: 'core/editor',
    title: 'Markdown Editor',
    description: 'Full-featured Markdown and frontmatter editor with live preview',
    version: '0.1.0',
    regions: ['main'],
    data: { note: 'required', query: 'none', writes: ['*'] },
  },
  component: EditorBlock,
}

export default function apply(ctx: Context) {
  if (ctx.blocks) {
    ctx.blocks.define(EditorDefinition)
  }
}
