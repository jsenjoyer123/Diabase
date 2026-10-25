import React, { useState, useEffect } from 'react'
import type { RepoFacts, UISpec } from '@diabase/protocol'
import { COMPONENT_CATALOG } from '@diabase/protocol'
import { GenUIRenderer } from '@diabase/plugin-genui/renderer'
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

const PRESETS = [
  { id: 'overview', title: '📊 Codebase Overview', prompt: 'Comprehensive codebase overview with files, lines of code, and recent commits' },
  { id: 'architecture', title: '🏗️ Architecture & Modules', prompt: 'Architecture, monorepo packages, plugins, and module dependency graph' },
  { id: 'git', title: '📈 Git Activity & History', prompt: 'Recent git commit history, branch status, and timeline' },
  { id: 'languages', title: '🗂️ Languages & Extensions', prompt: 'Languages distribution, file counts, and lines of code breakdown' },
  { id: 'debt', title: '⚠️ Technical Debt & TODOs', prompt: 'Code maintenance audit, TODOs, and technical debt' },
]

const FALLBACK_FACTS: RepoFacts = {
  name: 'Diabase-GenUI',
  rootPath: '/home/user/Documents/Diabase-GenUI',
  branch: 'main',
  totalFiles: 82,
  totalLinesOfCode: 18450,
  languages: [
    { language: 'TypeScript', extension: '.ts', files: 46, lines: 11200, percentage: 61 },
    { language: 'TypeScript (React)', extension: '.tsx', files: 16, lines: 3450, percentage: 19 },
    { language: 'Markdown', extension: '.md', files: 12, lines: 2400, percentage: 13 },
    { language: 'JSON', extension: '.json', files: 8, lines: 1400, percentage: 7 },
  ],
  recentCommits: [
    { hash: 'd1e09ac', message: 'feat(ui): implement ready-made React component catalog', author: 'Team', date: 'Just now' },
    { hash: '0420ef1', message: 'feat(protocol): define GenUI UISpec schema and repo contracts', author: 'Team', date: '10 min ago' },
  ],
  topFiles: [
    { path: 'packages/ui/src/index.ts', lines: 120, sizeBytes: 3400, language: 'TypeScript' },
    { path: 'plugins/genui/src/repo-scanner.ts', lines: 240, sizeBytes: 7800, language: 'TypeScript' },
    { path: 'packages/protocol/src/genui-spec.ts', lines: 380, sizeBytes: 12500, language: 'TypeScript' },
  ],
  todos: [
    { file: 'plugins/genui/src/index.ts', line: 15, type: 'NOTE', text: 'Cordis reactive service lifecycle' },
  ],
  dependencies: [
    { name: 'cordis', version: '4.0.0-rc.12', type: 'prod' },
    { name: '@anthropic-ai/sdk', version: '^0.39.0', type: 'prod' },
    { name: 'react', version: '^19.0.0', type: 'prod' },
    { name: 'zod', version: '^4.6.7', type: 'prod' },
  ],
  structure: {
    packages: ['kernel', 'protocol', 'ui', 'markdown', 'sdk'],
    plugins: ['genui', 'llm', 'bundler', 'vault', 'index'],
    apps: ['desktop'],
  },
}

export function App() {
  const [activeTab, setActiveTab] = useState<'studio' | 'gallery' | 'spec' | 'facts'>('studio')
  const [prompt, setPrompt] = useState('Comprehensive codebase overview with files, lines of code, and recent commits')
  const [loading, setLoading] = useState(false)
  const [facts, setFacts] = useState<RepoFacts>(FALLBACK_FACTS)
  const [activeSpec, setActiveSpec] = useState<UISpec | null>(null)
  const [activePreset, setActivePreset] = useState('overview')
  const [apiKey, setApiKey] = useState('')
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [statusMessage, setStatusMessage] = useState('')

  // Fetch facts from dev server API, or use fallback
  useEffect(() => {
    async function loadFacts() {
      try {
        const res = await fetch('/api/repo-facts')
        if (res.ok) {
          const data = await res.json()
          setFacts(data)
        }
      } catch {
        // Use initial fallback
      }
      handleGenerate(PRESETS[0]!.prompt)
    }
    loadFacts()
  }, [])

  const handleGenerate = async (customPrompt?: string) => {
    const p = customPrompt || prompt
    if (!p.trim()) return

    setLoading(true)
    setStatusMessage('Generating Generative UI with Claude Opus...')
    try {
      const res = await fetch('/api/generate-ui', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ prompt: p, apiKey: apiKey || undefined }),
      })

      if (res.ok) {
        const result = await res.json()
        if (result.spec) {
          setActiveSpec(result.spec)
        }
      } else {
        // Client fallback generation
        setActiveSpec(generateClientFallback(p, facts))
      }
    } catch {
      setActiveSpec(generateClientFallback(p, facts))
    } finally {
      setLoading(false)
      setStatusMessage('')
    }
  }

  const selectPreset = (preset: typeof PRESETS[0]) => {
    setActivePreset(preset.id)
    setPrompt(preset.prompt)
    handleGenerate(preset.prompt)
  }

  return (
    <div className="app-container">
      {/* Top Navbar */}
      <header className="navbar">
        <div className="brand-section">
          <div className="logo-badge">
            <div className="logo-icon">D</div>
            <span>Diabase</span>
          </div>
          <div className="model-pill">
            <span className="model-pulse" />
            <span>Claude 3 Opus</span>
            <span style={{ opacity: 0.6 }}>· {apiKey ? 'Live API Key' : 'Smart Offline Mode'}</span>
          </div>
        </div>

        <nav className="nav-tabs">
          <button
            className={`nav-tab-btn ${activeTab === 'studio' ? 'active' : ''}`}
            onClick={() => setActiveTab('studio')}
          >
            🎨 GenUI Studio
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'gallery' ? 'active' : ''}`}
            onClick={() => setActiveTab('gallery')}
          >
            🧩 Component Catalog ({COMPONENT_CATALOG.length})
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'spec' ? 'active' : ''}`}
            onClick={() => setActiveTab('spec')}
          >
            📜 UISpec JSON
          </button>
          <button
            className={`nav-tab-btn ${activeTab === 'facts' ? 'active' : ''}`}
            onClick={() => setActiveTab('facts')}
          >
            🔍 Repo Facts
          </button>
        </nav>

        <div>
          <button
            onClick={() => setShowKeyModal(true)}
            style={{
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border)',
              color: 'var(--diabase-text-main)',
              padding: '0.45rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            ⚙️ {apiKey ? 'API Key Set' : 'Configure Anthropic Key'}
          </button>
        </div>
      </header>

      {/* Main Studio View */}
      {activeTab === 'studio' && (
        <div className="studio-layout">
          {/* Sidebar */}
          <aside className="sidebar">
            <div>
              <div className="sidebar-title">Explore Presets</div>
              <div className="preset-list">
                {PRESETS.map((preset) => (
                  <button
                    key={preset.id}
                    className={`preset-btn ${activePreset === preset.id ? 'active' : ''}`}
                    onClick={() => selectPreset(preset)}
                  >
                    {preset.title}
                  </button>
                ))}
              </div>
            </div>

            {facts && (
              <div>
                <div className="sidebar-title">Target Repository</div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '0.5rem', fontSize: '0.825rem', color: 'var(--diabase-text-muted)' }}>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Project:</span>
                    <strong style={{ color: '#fff' }}>{facts.name}</strong>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Branch:</span>
                    <span style={{ color: 'var(--diabase-primary)' }}>{facts.branch}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Total Files:</span>
                    <span>{facts.totalFiles}</span>
                  </div>
                  <div style={{ display: 'flex', justifyContent: 'space-between' }}>
                    <span>Lines of Code:</span>
                    <span>{facts.totalLinesOfCode.toLocaleString()}</span>
                  </div>
                </div>
              </div>
            )}
          </aside>

          {/* Canvas Area */}
          <main className="canvas-area">
            {/* Prompt Bar */}
            <div className="prompt-bar-wrap">
              <form
                className="prompt-bar"
                onSubmit={(e) => {
                  e.preventDefault()
                  handleGenerate()
                }}
              >
                <input
                  type="text"
                  className="prompt-input"
                  placeholder="Ask Claude Opus to generate a dashboard view for this repository..."
                  value={prompt}
                  onChange={(e) => setPrompt(e.target.value)}
                  disabled={loading}
                />
                <button type="submit" className="generate-btn" disabled={loading}>
                  {loading ? (
                    <>
                      <div className="spinner" />
                      <span>Generating...</span>
                    </>
                  ) : (
                    <>
                      <span>✨</span>
                      <span>Generate View</span>
                    </>
                  )}
                </button>
              </form>
            </div>

            {statusMessage && (
              <div style={{ fontSize: '0.85rem', color: 'var(--diabase-primary)', display: 'flex', alignItems: 'center', gap: '0.5rem' }}>
                <div className="spinner" style={{ borderColor: 'rgba(99, 102, 241, 0.3)', borderTopColor: 'var(--diabase-primary)' }} />
                <span>{statusMessage}</span>
              </div>
            )}

            {/* Rendered Generative UI */}
            {activeSpec ? (
              <GenUIRenderer spec={activeSpec} />
            ) : (
              <div style={{ padding: '3rem', textAlign: 'center', color: 'var(--diabase-text-dim)' }}>
                No specification loaded. Click a preset or submit a prompt above.
              </div>
            )}
          </main>
        </div>
      )}

      {/* Component Gallery Tab */}
      {activeTab === 'gallery' && (
        <div style={{ padding: '2rem', maxWidth: '1200px', margin: '0 auto', width: '100%' }}>
          <div style={{ marginBottom: '1.5rem' }}>
            <h2 style={{ fontSize: '1.75rem', fontWeight: 700, marginBottom: '0.5rem' }}>
              Ready-Made React Component Catalog
            </h2>
            <p style={{ color: 'var(--diabase-text-muted)' }}>
              These are the 13 components the Generative UI model is permitted to compose. No raw React/JS code is written by the model—only structured UISpec trees.
            </p>
          </div>

          <div style={{ display: 'flex', flexDirection: 'column', gap: '2rem' }}>
            <Section title="1. Metric & KPI (Stat)" subtitle="Prominent numbers and trends">
              <Grid columns={3} gap="md">
                <Stat label="Total Files" value="85" subtext="Across 12 directories" icon="file" color="primary" />
                <Stat label="Lines of Code" value="24,580" delta={{ value: '+12%', trend: 'up', label: 'this week' }} icon="code" color="info" />
                <Stat label="Open Issues" value="4" delta={{ value: '-2', trend: 'down' }} icon="alert-circle" color="warning" />
              </Grid>
            </Section>

            <Section title="2. Data Visualization (Chart)" subtitle="Donut, bar, and trend charts">
              <Grid columns={2} gap="md">
                <Chart
                  type="donut"
                  title="Language Distribution"
                  unit="%"
                  data={[
                    { label: 'TypeScript', value: 75, color: '#6366f1' },
                    { label: 'Markdown', value: 15, color: '#06b6d4' },
                    { label: 'JSON', value: 10, color: '#f59e0b' },
                  ]}
                />
                <Chart
                  type="bar"
                  title="LOC by Package"
                  unit="lines"
                  data={[
                    { label: '@diabase/kernel', value: 3400 },
                    { label: '@diabase/protocol', value: 2800 },
                    { label: '@diabase/ui', value: 4100 },
                  ]}
                />
              </Grid>
            </Section>

            <Section title="3. Interactive Network Graph (Graph)" subtitle="Visual module dependencies">
              <Graph
                title="Monorepo Dependencies"
                nodes={[
                  { id: 'kernel', label: 'kernel', category: 'core', color: '#6366f1' },
                  { id: 'protocol', label: 'protocol', category: 'core', color: '#10b981' },
                  { id: 'ui', label: 'ui', category: 'ui', color: '#ec4899' },
                  { id: 'genui', label: 'genui', category: 'agent', color: '#06b6d4' },
                ]}
                edges={[
                  { source: 'kernel', target: 'protocol', label: 'imports' },
                  { source: 'ui', target: 'protocol', label: 'imports' },
                  { source: 'genui', target: 'protocol', label: 'imports' },
                  { source: 'genui', target: 'ui', label: 'renders' },
                ]}
              />
            </Section>

            <Section title="4. Structured Data (Table & List)" subtitle="Tabular and list views">
              <Grid columns={2} gap="md">
                <Table
                  title="Sample Files"
                  columns={[
                    { key: 'file', label: 'File', type: 'code' },
                    { key: 'lines', label: 'Lines', type: 'number' },
                    { key: 'lang', label: 'Lang', type: 'badge' },
                  ]}
                  rows={[
                    { file: 'src/index.ts', lines: 140, lang: 'TypeScript' },
                    { file: 'src/loader.ts', lines: 320, lang: 'TypeScript' },
                  ]}
                />
                <List
                  title="Recent Activity"
                  items={[
                    { title: 'Merge branch team/genui', subtitle: 'by orchestrator', icon: 'git-commit', badge: { text: 'merged', color: 'success' } },
                    { title: 'Scaffold components', subtitle: 'by ui agent', icon: 'zap', badge: { text: 'ready', color: 'primary' } },
                  ]}
                />
              </Grid>
            </Section>

            <Section title="5. Cards & TagCloud" subtitle="Overview cards and keyword clouds">
              <Cards
                title="Modules"
                columns={2}
                items={[
                  { title: '@diabase/protocol', subtitle: 'Contracts', description: 'Cross-process schemas and events', tags: ['Zod', 'TS'] },
                  { title: '@diabase/ui', subtitle: 'Components', description: 'Design tokens and ready-made widgets', tags: ['React', 'CSS'] },
                ]}
              />
              <TagCloud
                title="Technologies Cloud"
                tags={[
                  { name: 'TypeScript', count: 42, color: 'primary' },
                  { name: 'React 19', count: 28, color: 'info' },
                  { name: 'Cordis v4', count: 14, color: 'secondary' },
                  { name: 'Claude Opus', count: 8, color: 'success' },
                ]}
              />
            </Section>

            <Section title="6. Code, Markdown & Callouts" subtitle="Syntax-highlighted code and alerts">
              <Callout kind="tip" title="GenUI Best Practice" message="Always validate props with Zod before mounting any generated node tree." />
              <CodeViewer title="sample.ts" language="typescript" code={`// Generative UI component invocation\nconst spec = await genui.run({ prompt: 'Analyze codebase' })\nrender(<GenUIRenderer spec={spec} />)`} />
              <Markdown title="Documentation Notes" content={`### Markdown native\nEvery layout and UI block is serializable and **diffable** in Git.`} />
            </Section>
          </div>
        </div>
      )}

      {/* Raw UISpec JSON Inspector */}
      {activeTab === 'spec' && (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
          <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
            <h3 style={{ fontSize: '1.25rem', fontWeight: 600 }}>Active UISpec JSON Payload</h3>
            <button
              onClick={() => {
                if (activeSpec) {
                  navigator.clipboard.writeText(JSON.stringify(activeSpec, null, 2))
                  alert('UISpec copied to clipboard!')
                }
              }}
              style={{
                background: 'var(--diabase-bg-subtle)',
                border: '1px solid var(--diabase-border)',
                color: 'var(--diabase-text-main)',
                padding: '6px 14px',
                borderRadius: '6px',
                cursor: 'pointer',
              }}
            >
              📋 Copy JSON
            </button>
          </div>
          <CodeViewer
            title="Generated UISpec"
            language="json"
            code={activeSpec ? JSON.stringify(activeSpec, null, 2) : '// No active spec'}
          />
        </div>
      )}

      {/* Repository Facts Tab */}
      {activeTab === 'facts' && (
        <div style={{ padding: '2rem', maxWidth: '1000px', margin: '0 auto', width: '100%' }}>
          <h3 style={{ fontSize: '1.25rem', fontWeight: 600, marginBottom: '1rem' }}>
            Scanned Repository Facts (Prompt Context)
          </h3>
          <CodeViewer
            title="RepoFacts Object"
            language="json"
            code={facts ? JSON.stringify(facts, null, 2) : '// Scanning...'}
          />
        </div>
      )}

      {/* API Key Modal */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <h3 style={{ fontSize: '1.15rem', fontWeight: 600, marginBottom: '0.75rem' }}>
              Configure Anthropic Claude Opus API Key
            </h3>
            <p style={{ fontSize: '0.85rem', color: 'var(--diabase-text-muted)', marginBottom: '1rem', lineHeight: 1.5 }}>
              Enter your Anthropic API key to enable live Claude Opus generations. If left blank, Diabase runs in intelligent smart offline mode with pre-computed structural analysis.
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
  )
}

function generateClientFallback(prompt: string, facts: RepoFacts): UISpec {
  const topLang = facts.languages[0]?.language || 'TypeScript'
  const topLangPct = facts.languages[0]?.percentage || 0

  return {
    version: '1.0.0',
    title: `${facts.name} — Repository Overview`,
    description: `Analysis of ${facts.totalFiles} files across ${facts.structure.packages.length + facts.structure.plugins.length + facts.structure.apps.length} modules on branch "${facts.branch}"`,
    root: {
      component: 'Grid',
      props: { columns: 1, gap: 'lg' },
      children: [
        {
          component: 'Grid',
          props: { columns: 4, gap: 'md' },
          children: [
            {
              component: 'Stat',
              props: {
                label: 'Total Files',
                value: facts.totalFiles,
                subtext: `Active branch: ${facts.branch}`,
                icon: 'file',
                color: 'primary',
              },
            },
            {
              component: 'Stat',
              props: {
                label: 'Lines of Code',
                value: facts.totalLinesOfCode.toLocaleString(),
                subtext: `${topLangPct}% in ${topLang}`,
                icon: 'code',
                color: 'info',
              },
            },
            {
              component: 'Stat',
              props: {
                label: 'Recent Commits',
                value: facts.recentCommits.length,
                subtext: 'Repository history',
                icon: 'git-commit',
                color: 'success',
              },
            },
            {
              component: 'Stat',
              props: {
                label: 'Technical Debt',
                value: facts.todos.length,
                subtext: 'TODO / FIXME annotations',
                delta: { value: `${facts.todos.length} items`, trend: 'neutral' },
                icon: 'alert-circle',
                color: facts.todos.length > 10 ? 'warning' : 'success',
              },
            },
          ],
        },
        {
          component: 'Grid',
          props: { columns: 2, gap: 'md' },
          children: [
            {
              component: 'Chart',
              props: {
                type: 'donut',
                title: 'Languages Breakdown',
                subtitle: 'Distribution of lines of code by language',
                unit: '%',
                data: facts.languages.slice(0, 6).map((l) => ({
                  label: l.language,
                  value: l.percentage,
                  subtext: `${l.lines.toLocaleString()} lines`,
                })),
              },
            },
            {
              component: 'List',
              props: {
                title: 'Recent Git Commits',
                items: facts.recentCommits.slice(0, 5).map((c) => ({
                  id: c.hash,
                  title: c.message,
                  subtitle: `${c.author} · ${c.date}`,
                  icon: 'git-commit',
                  badge: { text: c.hash.slice(0, 7), color: 'primary' },
                })),
              },
            },
          ],
        },
        {
          component: 'Section',
          props: {
            title: 'Largest Codebase Files',
            subtitle: 'Files sorted by line count and size',
            badge: `${facts.topFiles.length} files`,
          },
          children: [
            {
              component: 'Table',
              props: {
                columns: [
                  { key: 'path', label: 'File Path', type: 'code' },
                  { key: 'lines', label: 'Lines', type: 'number', align: 'right' },
                  { key: 'sizeBytes', label: 'Size', type: 'bytes', align: 'right' },
                  { key: 'language', label: 'Language', type: 'badge' },
                ],
                rows: facts.topFiles,
                searchable: true,
                pagination: true,
                pageSize: 6,
              },
            },
          ],
        },
      ],
    },
  }
}
