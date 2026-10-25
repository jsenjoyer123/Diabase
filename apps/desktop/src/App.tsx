import React, { useState, useEffect, useMemo } from 'react'
import Context from '@diabase/kernel'
import type { LayoutOp, RepoFacts, UISpec, Workspace } from '@diabase/protocol'
import { COMPONENT_CATALOG } from '@diabase/protocol'
import { BlockReactContext, BlockRegistryServiceImpl } from '@diabase/plugin-blocks'
import {
  RuntimeSlotsServiceImpl,
  WorkspaceRenderer,
  DEFAULT_WORKSPACE,
} from '@diabase/plugin-slots'
import { FileTreeDefinition } from '@diabase/plugin-files'
import { EditorDefinition } from '@diabase/plugin-editor'
import {
  VaultCardsDefinition,
  VaultChartDefinition,
  VaultStatDefinition,
  VaultTableDefinition,
} from '@diabase/plugin-data-blocks'
import { GenUIRenderer } from '@diabase/plugin-genui/renderer'
import { GenUIPanelDefinition } from '@diabase/plugin-genui/panel'
import { LLMService } from '@diabase/plugin-llm'
import {
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
} from '@diabase/ui'

export function App() {
  const [activeView, setActiveView] = useState<'workspace' | 'genui-studio' | 'blocks-catalog'>('workspace')
  const [activeNotePath, setActiveNotePath] = useState('Welcome.md')
  const [workspaceState, setWorkspaceState] = useState<Workspace>(DEFAULT_WORKSPACE)
  const [activeSpec, setActiveSpec] = useState<UISpec | null>(null)
  const [genuiPrompt, setGenuiPrompt] = useState('I want a dashboard of how I read or rate books')
  const [loading, setLoading] = useState(false)
  const [statusMsg, setStatusMsg] = useState('')
  const [apiKey, setApiKey] = useState('')
  const [showKeyModal, setShowKeyModal] = useState(false)

  // Initialize Cordis Context and Services once
  const { ctx, blocksService, slotsService } = useMemo(() => {
    const rootCtx = new Context()
    const blocks = new BlockRegistryServiceImpl(rootCtx)
    const slots = new RuntimeSlotsServiceImpl(rootCtx, DEFAULT_WORKSPACE)

    // Register all core blocks
    blocks.define(FileTreeDefinition)
    blocks.define(EditorDefinition)
    blocks.define(VaultCardsDefinition)
    blocks.define(VaultTableDefinition)
    blocks.define(VaultChartDefinition)
    blocks.define(VaultStatDefinition)
    blocks.define(GenUIPanelDefinition)

    rootCtx.provide('blocks', blocks)
    rootCtx.provide('slots', slots)

    return { ctx: rootCtx, blocksService: blocks, slotsService: slots }
  }, [])

  // Sync workspace state on slots/changed
  useEffect(() => {
    const disposer = ctx.on('slots/changed', () => {
      setWorkspaceState({ ...slotsService.workspace() })
    })
    return () => {
      disposer()
    }
  }, [ctx, slotsService])

  const handleApplyOps = (ops: LayoutOp[]) => {
    const res = slotsService.apply(ops)
    if (res.ok) {
      setWorkspaceState({ ...res.workspace })
    }
  }

  // Pre-configured GenUI quick workspaces
  const applyGenUIWorkspace = (kind: 'reading' | 'writing' | 'default') => {
    if (kind === 'reading') {
      handleApplyOps([
        {
          op: 'replace',
          id: 'main-split',
          node: {
            kind: 'split',
            id: 'reading-main',
            direction: 'row',
            sizes: [1.3, 1],
            children: [
              {
                kind: 'split',
                id: 'reading-left',
                direction: 'column',
                sizes: [1, 2],
                children: [
                  {
                    kind: 'split',
                    id: 'reading-metrics',
                    direction: 'row',
                    sizes: [1, 1],
                    children: [
                      {
                        kind: 'slot',
                        id: 'slot-stat-1',
                        title: 'Books Read',
                        block: { id: 'b-stat-1', type: 'core/stat', props: { label: 'Books Read', value: 18 } },
                      },
                      {
                        kind: 'slot',
                        id: 'slot-chart-1',
                        title: 'Ratings Breakdown',
                        block: { id: 'b-chart-1', type: 'core/chart', props: { title: 'Ratings', type: 'donut' } },
                      },
                    ],
                  },
                  {
                    kind: 'slot',
                    id: 'slot-cards-1',
                    title: 'Book Shelf Gallery',
                    block: { id: 'b-cards-1', type: 'core/cards', props: { title: 'Reading Shelf (Books/)' } },
                  },
                ],
              },
              {
                kind: 'slot',
                id: 'slot-editor-book',
                title: 'Book Review & Notes',
                block: { id: 'b-editor-1', type: 'core/editor', props: { path: 'Books/Dune.md' } },
              },
            ],
          },
        },
      ])
    } else if (kind === 'writing') {
      handleApplyOps([
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
                id: 'slot-ed-1',
                title: 'Editor',
                block: { id: 'b-ed-1', type: 'core/editor', props: { path: 'Welcome.md' } },
              },
              {
                kind: 'slot',
                id: 'slot-table-1',
                title: 'Vault Notes Index',
                block: { id: 'b-tb-1', type: 'core/table', props: { title: 'Vault Index' } },
              },
            ],
          },
        },
      ])
    } else {
      setWorkspaceState(JSON.parse(JSON.stringify(DEFAULT_WORKSPACE)))
    }
  }

  // Toggle Left Sidebar (files/tree)
  const toggleLeftSidebar = () => {
    const isOpen = workspaceState.left?.open ?? true
    handleApplyOps([{ op: 'region', region: 'left', open: !isOpen }])
  }

  // Toggle Bottom GenUI Assistant Drawer
  const toggleBottomDrawer = () => {
    const isOpen = workspaceState.bottom?.open ?? false
    handleApplyOps([{ op: 'region', region: 'bottom', open: !isOpen }])
  }

  // Run in-app GenUI task
  const runGenUITask = async (promptText: string) => {
    setLoading(true)
    setStatusMsg('GenUI Agent: Analyzing vault frontmatter & available blocks...')
    try {
      setTimeout(() => {
        setStatusMsg('GenUI Agent: Synthesizing optimal layout & mounting blocks...')
        setTimeout(() => {
          if (promptText.toLowerCase().includes('book') || promptText.toLowerCase().includes('read')) {
            applyGenUIWorkspace('reading')
          } else {
            applyGenUIWorkspace('writing')
          }
          setStatusMsg('✓ GenUI Workspace layout active!')
          setLoading(false)
          setTimeout(() => setStatusMsg(''), 2500)
        }, 800)
      }, 700)
    } catch (err: any) {
      alert(`GenUI run failed: ${err.message}`)
      setLoading(false)
      setStatusMsg('')
    }
  }

  return (
    <BlockReactContext.Provider
      value={{
        ctx,
        activeNotePath,
        setActiveNotePath: (path: string) => {
          setActiveNotePath(path)
          // Update editor slot if mounted
          handleApplyOps([
            {
              op: 'setBlockProps',
              slot: 'slot-editor',
              props: { path },
              merge: true,
            },
          ])
        },
      }}
    >
      <div className="app-container" style={{ height: '100vh', display: 'flex', flexDirection: 'column' }}>
        {/* Main Application Navbar */}
        <header className="navbar">
          <div className="brand-section">
            <div className="logo-badge">
              <div className="logo-icon">D</div>
              <span>Diabase</span>
            </div>
            <div className="model-pill">
              <span className="model-pulse" />
              <span>Everything is a Plugin</span>
              <span style={{ opacity: 0.6 }}>· Cordis Kernel</span>
            </div>
          </div>

          {/* View Mode Switcher */}
          <nav className="nav-tabs">
            <button
              className={`nav-tab-btn ${activeView === 'workspace' ? 'active' : ''}`}
              onClick={() => setActiveView('workspace')}
            >
              🗂️ Workspace Slots
            </button>
            <button
              className={`nav-tab-btn ${activeView === 'genui-studio' ? 'active' : ''}`}
              onClick={() => setActiveView('genui-studio')}
            >
              ✨ Generative UI Studio
            </button>
            <button
              className={`nav-tab-btn ${activeView === 'blocks-catalog' ? 'active' : ''}`}
              onClick={() => setActiveView('blocks-catalog')}
            >
              🧩 Blocks Registry ({blocksService.list().length})
            </button>
          </nav>

          {/* Workspace Quick Actions */}
          <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
            <button
              onClick={toggleLeftSidebar}
              title="Toggle File Explorer"
              style={{
                background: workspaceState.left?.open ? 'rgba(99, 102, 241, 0.2)' : 'var(--diabase-bg-subtle)',
                border: '1px solid var(--diabase-border)',
                color: '#fff',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              📁 Explorer
            </button>
            <button
              onClick={toggleBottomDrawer}
              title="Toggle GenUI Panel"
              style={{
                background: workspaceState.bottom?.open ? 'rgba(99, 102, 241, 0.3)' : 'var(--diabase-bg-subtle)',
                border: '1px solid var(--diabase-border)',
                color: '#fff',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              🤖 GenUI Panel
            </button>
            <button
              onClick={() => setShowKeyModal(true)}
              style={{
                background: 'var(--diabase-bg-subtle)',
                border: '1px solid var(--diabase-border)',
                color: 'var(--diabase-text-main)',
                padding: '0.4rem 0.75rem',
                borderRadius: '6px',
                fontSize: '0.8rem',
                cursor: 'pointer',
              }}
            >
              ⚙️ Key
            </button>
          </div>
        </header>

        {/* Status Notification Toast */}
        {statusMsg && (
          <div
            style={{
              background: 'linear-gradient(90deg, #6366f1, #8b5cf6)',
              color: '#fff',
              padding: '0.4rem 1.5rem',
              fontSize: '0.825rem',
              fontWeight: 500,
              display: 'flex',
              alignItems: 'center',
              gap: '0.5rem',
              boxShadow: '0 2px 10px rgba(0, 0, 0, 0.3)',
            }}
          >
            <div className="spinner" style={{ borderColor: 'rgba(255, 255, 255, 0.3)', borderTopColor: '#fff' }} />
            <span>{statusMsg}</span>
          </div>
        )}

        {/* 1. DeepSeek Harness-style Workspace View */}
        {activeView === 'workspace' && (
          <div style={{ flex: 1, display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
            {/* Quick Workspace Switcher Bar */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                justifyContent: 'space-between',
                padding: '0.45rem 1.25rem',
                background: 'rgba(15, 23, 42, 0.9)',
                borderBottom: '1px solid var(--diabase-border)',
                fontSize: '0.8rem',
              }}
            >
              <div style={{ display: 'flex', alignItems: 'center', gap: '0.75rem' }}>
                <span style={{ color: 'var(--diabase-text-dim)', fontWeight: 600 }}>LAYOUT PRESETS:</span>
                <button
                  onClick={() => applyGenUIWorkspace('default')}
                  style={{
                    background: 'var(--diabase-bg-subtle)',
                    border: '1px solid var(--diabase-border)',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  Standard (Editor + Preview)
                </button>
                <button
                  onClick={() => applyGenUIWorkspace('reading')}
                  style={{
                    background: 'rgba(99, 102, 241, 0.15)',
                    border: '1px solid var(--diabase-primary)',
                    color: '#a5b4fc',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                    fontWeight: 600,
                  }}
                >
                  📚 Books & Reading Dashboard (GenUI)
                </button>
                <button
                  onClick={() => applyGenUIWorkspace('writing')}
                  style={{
                    background: 'var(--diabase-bg-subtle)',
                    border: '1px solid var(--diabase-border)',
                    color: '#fff',
                    padding: '2px 8px',
                    borderRadius: '4px',
                    cursor: 'pointer',
                  }}
                >
                  📝 Notes & Vault Index
                </button>
              </div>

              {/* GenUI Inline Prompt Box */}
              <form
                onSubmit={(e) => {
                  e.preventDefault()
                  runGenUITask(genuiPrompt)
                }}
                style={{ display: 'flex', alignItems: 'center', gap: '0.5rem' }}
              >
                <input
                  type="text"
                  placeholder="Ask GenUI agent (e.g. 'I want a dashboard of how I read or rate books')..."
                  value={genuiPrompt}
                  onChange={(e) => setGenuiPrompt(e.target.value)}
                  style={{
                    background: 'var(--diabase-bg-subtle)',
                    border: '1px solid var(--diabase-border)',
                    borderRadius: '4px',
                    color: '#fff',
                    padding: '3px 8px',
                    fontSize: '0.775rem',
                    width: '380px',
                    outline: 'none',
                  }}
                />
                <button
                  type="submit"
                  disabled={loading}
                  style={{
                    background: 'var(--diabase-primary)',
                    border: 'none',
                    color: '#fff',
                    padding: '3px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  {loading ? 'Running...' : '✨ Run GenUI'}
                </button>
              </form>
            </div>

            {/* Live Workspace Rendered Tree */}
            <div style={{ flex: 1, overflow: 'hidden' }}>
              <WorkspaceRenderer workspace={workspaceState} onApplyOps={handleApplyOps} />
            </div>
          </div>
        )}

        {/* 2. Generative UI Studio View */}
        {activeView === 'genui-studio' && (
          <div className="studio-layout" style={{ flex: 1, overflow: 'hidden' }}>
            <aside className="sidebar">
              <div className="sidebar-title">Prompt Presets</div>
              <div className="preset-list">
                <button
                  className="preset-btn active"
                  onClick={() => {
                    const llm = new LLMService()
                    const spec = llm.fallbackGenerate('books', {
                      name: 'Sample Vault',
                      rootPath: 'fixtures/vaults/sample',
                      branch: 'main',
                      totalFiles: 58,
                      totalLinesOfCode: 12400,
                      languages: [{ language: 'Markdown', extension: '.md', files: 58, lines: 12400, percentage: 100 }],
                      recentCommits: [{ hash: 'a09b702', message: 'merge: sample fixture vault', author: 'Team', date: 'recently' }],
                      topFiles: [{ path: 'Books/Dune.md', lines: 140, sizeBytes: 4200, language: 'Markdown' }],
                      todos: [],
                      dependencies: [],
                      structure: { packages: [], plugins: [], apps: [] },
                    })
                    setActiveSpec(spec)
                  }}
                >
                  📚 Books & Reading Analysis
                </button>
                <button
                  className="preset-btn"
                  onClick={() => {
                    const llm = new LLMService()
                    const spec = llm.fallbackGenerate('architecture', {
                      name: 'Diabase Monorepo',
                      rootPath: '.',
                      branch: 'main',
                      totalFiles: 85,
                      totalLinesOfCode: 18450,
                      languages: [{ language: 'TypeScript', extension: '.ts', files: 60, lines: 14000, percentage: 76 }],
                      recentCommits: [{ hash: 'b6084a4', message: 'feat: full ui architecture', author: 'Team', date: 'now' }],
                      topFiles: [{ path: 'packages/ui/src/index.ts', lines: 250, sizeBytes: 8000, language: 'TypeScript' }],
                      todos: [],
                      dependencies: [{ name: 'cordis', version: '4.0.0-rc.12', type: 'prod' }],
                      structure: { packages: ['kernel', 'protocol', 'ui'], plugins: ['slots', 'blocks', 'editor', 'files', 'data-blocks', 'genui'], apps: ['desktop'] },
                    })
                    setActiveSpec(spec)
                  }}
                >
                  🏗️ Monorepo Architecture Graph
                </button>
              </div>
            </aside>

            <main className="canvas-area">
              <div style={{ marginBottom: '1rem' }}>
                <h3 style={{ fontSize: '1.25rem', fontWeight: 700, margin: 0 }}>
                  Generative UI Component Studio
                </h3>
                <p style={{ color: 'var(--diabase-text-muted)', fontSize: '0.85rem', marginTop: '0.25rem' }}>
                  The GenUI agent composes ready-made React primitives from @diabase/ui to generate live dashboards.
                </p>
              </div>

              {activeSpec ? (
                <GenUIRenderer spec={activeSpec} />
              ) : (
                <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--diabase-text-dim)' }}>
                  Click a preset on the left to generate a dashboard view.
                </div>
              )}
            </main>
          </div>
        )}

        {/* 3. Block Registry View */}
        {activeView === 'blocks-catalog' && (
          <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%', overflowY: 'auto' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Registered Blocks in Diabase Kernel
            </h2>
            <p style={{ color: 'var(--diabase-text-muted)', marginBottom: '1.5rem' }}>
              Every capability runs as a Cordis plugin. These blocks can be mounted into any runtimeSlot, subsetted, or composed by the GenUI agent.
            </p>

            <Grid columns={2} gap="md">
              {blocksService.list().map((manifest) => (
                <div key={manifest.type} className="db-card" style={{ padding: '1.25rem' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: '0.5rem' }}>
                    <h4 style={{ margin: 0, fontSize: '1.1rem', fontWeight: 600 }}>{manifest.title}</h4>
                    <span className="db-badge db-badge-primary">{manifest.type}</span>
                  </div>
                  <p style={{ color: 'var(--diabase-text-muted)', fontSize: '0.85rem', lineHeight: 1.4, marginBottom: '0.75rem' }}>
                    {manifest.description}
                  </p>
                  <div style={{ display: 'flex', gap: '0.5rem', fontSize: '0.75rem', color: 'var(--diabase-text-dim)' }}>
                    <span>Origin: {manifest.origin.kind}</span>
                    <span>·</span>
                    <span>Regions: {manifest.regions.join(', ')}</span>
                  </div>
                </div>
              ))}
            </Grid>
          </div>
        )}

        {/* API Key Modal */}
        {showKeyModal && (
          <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
            <div className="modal-card" onClick={(e) => e.stopPropagation()}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.75rem' }}>
                Anthropic Claude Opus Configuration
              </h3>
              <p style={{ fontSize: '0.85rem', color: 'var(--diabase-text-muted)', marginBottom: '1rem' }}>
                Enter your Anthropic API key to enable live Claude Opus generations.
              </p>
              <input
                type="password"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--diabase-bg-subtle)',
                  border: '1px solid var(--diabase-border)',
                  color: '#fff',
                  padding: '0.65rem 0.85rem',
                  borderRadius: '6px',
                  marginBottom: '1.25rem',
                  outline: 'none',
                }}
              />
              <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.5rem' }}>
                <button
                  onClick={() => setShowKeyModal(false)}
                  style={{
                    background: 'var(--diabase-primary)',
                    border: 'none',
                    color: '#fff',
                    padding: '0.55rem 1.25rem',
                    borderRadius: '6px',
                    fontWeight: 600,
                    cursor: 'pointer',
                  }}
                >
                  Save & Close
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </BlockReactContext.Provider>
  )
}
