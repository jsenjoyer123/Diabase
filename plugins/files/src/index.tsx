import React, { useState, type FC } from 'react'
import type { Context } from '@diabase/kernel'
import type { BlockDefinition, BlockProps } from '@diabase/protocol'
import { useBlockContext } from '@diabase/plugin-blocks'
import { Icon } from '@diabase/ui'

export interface FileTreeProps {
  files?: Array<{ path: string; title: string; folder?: string }>
}

export const FileTreeBlock: FC<BlockProps<FileTreeProps>> = ({ props }) => {
  const { activeNotePath, setActiveNotePath } = useBlockContext()
  const [filter, setFilter] = useState('')
  const [expandedFolders, setExpandedFolders] = useState<Record<string, boolean>>({
    Books: true,
    Daily: true,
    Projects: true,
  })

  // Sample default file list (derived from sample vault)
  const defaultFiles = props.files || [
    { path: 'Welcome.md', title: 'Welcome', folder: '' },
    { path: 'Inbox.md', title: 'Inbox', folder: '' },
    { path: 'Books/Dune.md', title: 'Dune', folder: 'Books' },
    { path: 'Books/Neuromancer.md', title: 'Neuromancer', folder: 'Books' },
    { path: 'Books/Snow Crash.md', title: 'Snow Crash', folder: 'Books' },
    { path: 'Books/Hyperion.md', title: 'Hyperion', folder: 'Books' },
    { path: 'Daily/2026-10-24.md', title: '2026-10-24', folder: 'Daily' },
    { path: 'Daily/2026-10-25.md', title: '2026-10-25', folder: 'Daily' },
    { path: 'Projects/Diabase/Overview.md', title: 'Diabase Overview', folder: 'Projects' },
    { path: 'People/Paul Atreides.md', title: 'Paul Atreides', folder: 'People' },
  ]

  const filtered = defaultFiles.filter((f) =>
    f.title.toLowerCase().includes(filter.toLowerCase()) || f.path.toLowerCase().includes(filter.toLowerCase()),
  )

  // Group by folder
  const groups: Record<string, typeof defaultFiles> = {}
  filtered.forEach((f) => {
    const folder = f.folder || 'Root'
    if (!groups[folder]) groups[folder] = []
    groups[folder]!.push(f)
  })

  const toggleFolder = (folder: string) => {
    setExpandedFolders((prev) => ({ ...prev, [folder]: !prev[folder] }))
  }

  return (
    <div
      style={{
        display: 'flex',
        flexDirection: 'column',
        height: '100%',
        padding: '0.65rem 0.5rem',
        fontSize: '0.825rem',
        color: 'var(--diabase-text-main)',
      }}
    >
      {/* Search Input */}
      <div style={{ marginBottom: '0.75rem', position: 'relative' }}>
        <input
          type="text"
          placeholder="Filter notes..."
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          style={{
            width: '100%',
            background: 'var(--diabase-bg-subtle)',
            border: '1px solid var(--diabase-border)',
            borderRadius: '4px',
            color: 'var(--diabase-text-main)',
            padding: '0.35rem 0.6rem 0.35rem 1.6rem',
            fontSize: '0.8rem',
            outline: 'none',
          }}
        />
        <div style={{ position: 'absolute', left: '6px', top: '7px', color: 'var(--diabase-text-dim)' }}>
          <Icon name="search" size={12} />
        </div>
      </div>

      {/* Files List */}
      <div style={{ flex: 1, overflowY: 'auto', display: 'flex', flexDirection: 'column', gap: '0.5rem' }}>
        {Object.entries(groups).map(([folder, items]) => {
          const isOpen = expandedFolders[folder] !== false
          return (
            <div key={folder}>
              {folder !== 'Root' && (
                <div
                  onClick={() => toggleFolder(folder)}
                  style={{
                    display: 'flex',
                    alignItems: 'center',
                    gap: '0.4rem',
                    padding: '0.25rem 0.4rem',
                    cursor: 'pointer',
                    color: 'var(--diabase-text-muted)',
                    fontWeight: 600,
                    fontSize: '0.75rem',
                    textTransform: 'uppercase',
                    letterSpacing: '0.04em',
                    userSelect: 'none',
                  }}
                >
                  <span>{isOpen ? '▾' : '▸'}</span>
                  <span>📁 {folder}</span>
                  <span style={{ fontSize: '0.7rem', color: 'var(--diabase-text-dim)', marginLeft: 'auto' }}>
                    {items.length}
                  </span>
                </div>
              )}

              {isOpen && (
                <div style={{ display: 'flex', flexDirection: 'column', gap: '2px', paddingLeft: folder === 'Root' ? 0 : '0.6rem' }}>
                  {items.map((file) => {
                    const isActive = activeNotePath === file.path
                    return (
                      <div
                        key={file.path}
                        onClick={() => setActiveNotePath && setActiveNotePath(file.path)}
                        style={{
                          display: 'flex',
                          alignItems: 'center',
                          gap: '0.5rem',
                          padding: '0.35rem 0.5rem',
                          borderRadius: '4px',
                          cursor: 'pointer',
                          background: isActive ? 'rgba(99, 102, 241, 0.2)' : 'transparent',
                          color: isActive ? '#fff' : 'var(--diabase-text-muted)',
                          borderLeft: isActive ? '2px solid var(--diabase-primary)' : '2px solid transparent',
                          transition: 'all 0.15s ease',
                        }}
                      >
                        <span style={{ color: isActive ? 'var(--diabase-primary)' : 'var(--diabase-text-dim)' }}>
                          📄
                        </span>
                        <span style={{ flex: 1, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }}>
                          {file.title}
                        </span>
                      </div>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}

export const FileTreeDefinition: BlockDefinition<FileTreeProps> = {
  manifest: {
    type: 'files/tree',
    title: 'File Explorer',
    description: 'Vault file tree navigation and folder hierarchy',
    version: '0.1.0',
    regions: ['sidebar', 'main'],
  },
  component: FileTreeBlock,
}

export default function apply(ctx: Context) {
  if (ctx.blocks) {
    ctx.blocks.define(FileTreeDefinition)
  }
}
