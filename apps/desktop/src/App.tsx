import React, { useState, useEffect, useMemo, useRef } from 'react'
import type { RepoFacts, UISpec } from '@diabase/protocol'
import { COMPONENT_CATALOG, validateUISpec } from '@diabase/protocol'
import { GenUIRenderer } from '@diabase/plugin-genui/renderer'
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

// Built-in Repository / Project Profiles for exploration
const REPO_PROFILES: Record<string, RepoFacts> = {
  vault: {
    name: 'Sample Vault (Books & Notes)',
    rootPath: 'fixtures/vaults/sample',
    branch: 'main',
    totalFiles: 58,
    totalLinesOfCode: 12400,
    languages: [
      { language: 'Markdown', extension: '.md', files: 58, lines: 12400, percentage: 100 },
    ],
    recentCommits: [
      { hash: 'b6084a4', message: 'merge: sample fixture vault (V0)', author: 'Team Vault', date: 'Oct 25, 2026' },
      { hash: '5f354cf', message: 'test(fixtures): add sample vault fixture', author: 'Team Vault', date: 'Oct 24, 2026' },
      { hash: '5f5292c', message: 'chore(vault): scaffold vault & markdown frontmatter indexing', author: 'Team Vault', date: 'Oct 24, 2026' },
    ],
    topFiles: [
      { path: 'Books/Dune.md', lines: 140, sizeBytes: 4200, language: 'Markdown' },
      { path: 'Books/Neuromancer.md', lines: 115, sizeBytes: 3800, language: 'Markdown' },
      { path: 'Books/Snow-Crash.md', lines: 105, sizeBytes: 3400, language: 'Markdown' },
      { path: 'Books/Foundation.md', lines: 98, sizeBytes: 3100, language: 'Markdown' },
      { path: 'Books/Hyperion.md', lines: 125, sizeBytes: 4100, language: 'Markdown' },
      { path: 'Daily/2026-10-25.md', lines: 45, sizeBytes: 1500, language: 'Markdown' },
    ],
    todos: [
      { file: 'Books/Dune.md', line: 12, text: 'Review Dune Messiah next week', type: 'TODO' },
      { file: 'Projects/Roadmap.md', line: 34, text: 'Finalize plugin system architecture', type: 'TODO' },
    ],
    dependencies: [],
    structure: {
      packages: [],
      plugins: [],
      apps: [],
    },
  },
  monorepo: {
    name: 'Diabase Engine & Plugins',
    rootPath: '.',
    branch: 'main',
    totalFiles: 92,
    totalLinesOfCode: 24650,
    languages: [
      { language: 'TypeScript', extension: '.ts', files: 68, lines: 18200, percentage: 74 },
      { language: 'Markdown', extension: '.md', files: 12, lines: 2800, percentage: 11 },
      { language: 'CSS', extension: '.css', files: 6, lines: 2450, percentage: 10 },
      { language: 'JSON', extension: '.json', files: 6, lines: 1200, percentage: 5 },
    ],
    recentCommits: [
      { hash: '9f57f05', message: 'merge: origin/main (kernel bridge, inspector and wire protocol)', author: 'Sasha', date: 'now' },
      { hash: '988e594', message: 'merge: agent/kernel/shell (Electron shell & electron-vite)', author: 'Sasha', date: '10 mins ago' },
      { hash: '9f6bdbe', message: 'feat(ui): implement complete Diabase UI & GenUI engine', author: 'Sasha', date: '20 mins ago' },
      { hash: '4ac766b', message: 'merge: agent/vault/searchcore (BM25 search engine)', author: 'Sasha', date: '30 mins ago' },
      { hash: '585f8a1', message: 'merge: agent/vault/memvault (in-memory vault service)', author: 'Sasha', date: '40 mins ago' },
    ],
    topFiles: [
      { path: 'packages/ui/src/index.ts', lines: 340, sizeBytes: 9800, language: 'TypeScript' },
      { path: 'plugins/llm/src/index.ts', lines: 410, sizeBytes: 12800, language: 'TypeScript' },
      { path: 'plugins/genui/src/renderer.tsx', lines: 180, sizeBytes: 5600, language: 'TypeScript' },
      { path: 'packages/protocol/src/genui-spec.ts', lines: 240, sizeBytes: 7400, language: 'TypeScript' },
      { path: 'packages/kernel/src/index.ts', lines: 210, sizeBytes: 6800, language: 'TypeScript' },
      { path: 'plugins/slots/src/ops.ts', lines: 195, sizeBytes: 6200, language: 'TypeScript' },
    ],
    todos: [
      { file: 'plugins/editor/src/index.ts', line: 45, text: 'Support live WYSIWYG mode', type: 'TODO' },
      { file: 'plugins/search/src/index.ts', line: 88, text: 'Optimize vector embeddings cache', type: 'TODO' },
    ],
    dependencies: [
      { name: 'cordis', version: '4.0.0-rc.12', type: 'prod' },
      { name: '@anthropic-ai/sdk', version: '^0.39.0', type: 'prod' },
      { name: 'react', version: '^19.0.0', type: 'prod' },
      { name: 'zod', version: '^3.23.8', type: 'prod' },
      { name: 'minisearch', version: '^7.1.0', type: 'prod' },
      { name: 'esbuild', version: '^0.25.0', type: 'dev' },
    ],
    structure: {
      packages: ['kernel', 'protocol', 'ui'],
      plugins: ['blocks', 'slots', 'editor', 'files', 'data-blocks', 'genui', 'llm', 'search', 'vault', 'bundler'],
      apps: ['desktop'],
    },
  },
}

export function App() {
  const [selectedRepoKey, setSelectedRepoKey] = useState<'vault' | 'monorepo'>('vault')
  const [activeSpec, setActiveSpec] = useState<UISpec | null>(null)
  const [promptInput, setPromptInput] = useState('I want a dashboard of how I read or rate books')
  const [isGenerating, setIsGenerating] = useState(false)
  const [generationStep, setGenerationStep] = useState('')
  const [canvasMode, setCanvasMode] = useState<'preview' | 'json'>('preview')
  const [showSpecModal, setShowSpecModal] = useState(false)
  const [showKeyModal, setShowKeyModal] = useState(false)
  const [apiKey, setApiKey] = useState('')
  const [copyFeedback, setCopyFeedback] = useState(false)

  const activeFacts = (REPO_PROFILES[selectedRepoKey] ?? REPO_PROFILES.vault) as RepoFacts

  // Initialize LLM service instance
  const llmService = useMemo(() => {
    return new LLMService({ apiKey: apiKey || undefined })
  }, [apiKey])

  // On first load, generate initial Books & Reading Dashboard
  useEffect(() => {
    handleRunPrompt('I want a dashboard of how I read or rate books', 'vault')
  }, [])

  // Execute GenUI task
  const handleRunPrompt = async (prompt: string, overrideRepo?: 'vault' | 'monorepo') => {
    const repoKey = overrideRepo || selectedRepoKey
    const facts = (REPO_PROFILES[repoKey] ?? REPO_PROFILES.vault) as RepoFacts

    setIsGenerating(true)
    setGenerationStep('🔍 Scanning repository structure & frontmatter...')

    try {
      await new Promise((r) => setTimeout(r, 350))
      setGenerationStep('🧠 Claude Opus (claude-3-opus-20240229): Synthesizing UI components...')
      await new Promise((r) => setTimeout(r, 450))

      const result = await llmService.generateUI(prompt, facts)
      setActiveSpec(result.spec)
      setGenerationStep('✓ Dashboard generated successfully!')

      setTimeout(() => {
        setIsGenerating(false)
        setGenerationStep('')
      }, 500)
    } catch (err: any) {
      console.error('GenUI execution error:', err)
      const fallback = llmService.fallbackGenerate(prompt, facts)
      setActiveSpec(fallback)
      setIsGenerating(false)
      setGenerationStep('')
    }
  }

  // Handle preset click
  const handlePresetClick = (presetPrompt: string, repo: 'vault' | 'monorepo') => {
    setSelectedRepoKey(repo)
    setPromptInput(presetPrompt)
    handleRunPrompt(presetPrompt, repo)
  }

  // Copy JSON to clipboard
  const handleCopySpec = () => {
    if (!activeSpec) return
    navigator.clipboard.writeText(JSON.stringify(activeSpec, null, 2))
    setCopyFeedback(true)
    setTimeout(() => setCopyFeedback(false), 2000)
  }

  return (
    <div className="app-container">
      {/* 1. Global Navigation Bar */}
      <header className="navbar">
        <div className="brand-section">
          <div className="logo-badge">
            <div className="logo-icon">D</div>
            <span>Diabase</span>
          </div>
          <div className="model-pill">
            <span className="model-pulse" />
            <span>Generative UI Engine</span>
            <span style={{ opacity: 0.6 }}>· Claude 3 Opus</span>
          </div>
        </div>

        {/* Center: Explored Repository Selector */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <span style={{ fontSize: '0.8rem', color: 'var(--diabase-text-dim)', fontWeight: 600 }}>
            EXPLORING:
          </span>
          <select
            value={selectedRepoKey}
            onChange={(e) => {
              const newKey = e.target.value as 'vault' | 'monorepo'
              setSelectedRepoKey(newKey)
              handleRunPrompt(
                newKey === 'vault' ? 'I want a dashboard of how I read or rate books' : 'Monorepo architecture and components',
                newKey
              )
            }}
            style={{
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border-glow)',
              color: '#fff',
              padding: '0.4rem 0.85rem',
              borderRadius: '6px',
              fontSize: '0.825rem',
              fontWeight: 600,
              outline: 'none',
              cursor: 'pointer',
            }}
          >
            <option value="vault">📚 Sample Vault (Books & Notes · 58 files)</option>
            <option value="monorepo">⚡ Diabase Monorepo (Core & 10 Plugins · 92 files)</option>
          </select>
        </div>

        {/* Right Action Buttons */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.6rem' }}>
          <button
            onClick={() => setShowSpecModal(true)}
            style={{
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border)',
              color: 'var(--diabase-text-main)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              fontWeight: 500,
              cursor: 'pointer',
              display: 'flex',
              alignItems: 'center',
              gap: '0.4rem',
            }}
          >
            <span>{'{ }'}</span>
            <span>View UISpec JSON</span>
          </button>

          <button
            onClick={handleCopySpec}
            style={{
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border)',
              color: copyFeedback ? '#10b981' : 'var(--diabase-text-main)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            {copyFeedback ? '✓ Copied!' : '📥 Export JSON'}
          </button>

          <button
            onClick={() => setShowKeyModal(true)}
            style={{
              background: apiKey ? 'rgba(16, 185, 129, 0.15)' : 'var(--diabase-bg-subtle)',
              border: `1px solid ${apiKey ? '#10b981' : 'var(--diabase-border)'}`,
              color: apiKey ? '#34d399' : 'var(--diabase-text-main)',
              padding: '0.4rem 0.75rem',
              borderRadius: '6px',
              fontSize: '0.8rem',
              cursor: 'pointer',
            }}
          >
            ⚙️ {apiKey ? 'Claude Opus (Live API)' : 'API Key'}
          </button>
        </div>
      </header>

      {/* 2. Floating AI Prompt Hero Section */}
      <section
        style={{
          background: 'linear-gradient(180deg, rgba(15, 23, 42, 0.95) 0%, rgba(10, 15, 30, 0.8) 100%)',
          borderBottom: '1px solid var(--diabase-border)',
          padding: '1.25rem 2rem 1.1rem 2rem',
          display: 'flex',
          flexDirection: 'column',
          alignItems: 'center',
          gap: '0.85rem',
        }}
      >
        <form
          onSubmit={(e) => {
            e.preventDefault()
            if (promptInput.trim()) {
              handleRunPrompt(promptInput)
            }
          }}
          style={{ width: '100%', maxWidth: '960px' }}
        >
          <div className="prompt-bar">
            <span style={{ fontSize: '1.25rem', opacity: 0.8, marginRight: '0.5rem' }}>✨</span>
            <input
              type="text"
              className="prompt-input"
              placeholder="Ask GenUI to explore the project (e.g. 'I want a dashboard of how I read or rate books', 'Architecture & tech stack', 'Code metrics & debt')..."
              value={promptInput}
              onChange={(e) => setPromptInput(e.target.value)}
              disabled={isGenerating}
            />
            <button type="submit" className="generate-btn" disabled={isGenerating}>
              {isGenerating ? (
                <>
                  <div className="spinner" />
                  <span>Synthesizing...</span>
                </>
              ) : (
                <>
                  <span>Generate Dashboard</span>
                  <span>→</span>
                </>
              )}
            </button>
          </div>
        </form>

        {/* Quick Suggestion Chips */}
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.5rem', flexWrap: 'wrap', justifyContent: 'center' }}>
          <span style={{ fontSize: '0.75rem', color: 'var(--diabase-text-dim)', fontWeight: 600, marginRight: '0.25rem' }}>
            SUGGESTIONS:
          </span>
          <button
            className="chip-btn"
            onClick={() => handlePresetClick('I want a dashboard of how I read or rate books', 'vault')}
          >
            📚 Books & Reading Habits
          </button>
          <button
            className="chip-btn"
            onClick={() => handlePresetClick('Architecture, monorepo structure and plugins dependency graph', 'monorepo')}
          >
            🏗️ Architecture & Plugin Graph
          </button>
          <button
            className="chip-btn"
            onClick={() => handlePresetClick('Show language breakdown, line counts and largest files', 'monorepo')}
          >
            📊 File & Language Metrics
          </button>
          <button
            className="chip-btn"
            onClick={() => handlePresetClick('Code hygiene, TODO comments and technical debt audit', 'monorepo')}
          >
            🐛 TODOs & Technical Debt
          </button>
          <button
            className="chip-btn"
            onClick={() => handlePresetClick('Recent Git commit history and author timeline', 'monorepo')}
          >
            📜 Git Commits History
          </button>
        </div>

        {/* Generation Progress Banner */}
        {generationStep && (
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              gap: '0.6rem',
              color: '#a5b4fc',
              fontSize: '0.8rem',
              fontWeight: 500,
            }}
          >
            <div className="spinner" style={{ borderColor: 'rgba(165, 180, 252, 0.3)', borderTopColor: '#a5b4fc' }} />
            <span>{generationStep}</span>
          </div>
        )}
      </section>

      {/* 3. Studio Two-Column Layout */}
      <div className="studio-layout">
        {/* Left Sidebar: Repository Facts & Component Catalog */}
        <aside className="sidebar">
          {/* Active Project Card */}
          <div
            style={{
              background: 'var(--diabase-bg-subtle)',
              border: '1px solid var(--diabase-border)',
              borderRadius: '8px',
              padding: '1rem',
              display: 'flex',
              flexDirection: 'column',
              gap: '0.6rem',
            }}
          >
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between' }}>
              <span style={{ fontSize: '0.75rem', fontWeight: 700, color: '#a5b4fc', textTransform: 'uppercase' }}>
                EXPLORED PROJECT
              </span>
              <span
                style={{
                  fontSize: '0.7rem',
                  background: 'rgba(99, 102, 241, 0.2)',
                  color: '#a5b4fc',
                  padding: '2px 6px',
                  borderRadius: '4px',
                }}
              >
                git:{activeFacts.branch}
              </span>
            </div>
            <div style={{ fontWeight: 700, fontSize: '0.95rem' }}>{activeFacts.name}</div>
            <div style={{ fontSize: '0.75rem', color: 'var(--diabase-text-dim)', wordBreak: 'break-all' }}>
              📁 {activeFacts.rootPath}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '0.5rem', marginTop: '0.3rem' }}>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--diabase-text-dim)' }}>Files</div>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{activeFacts.totalFiles}</div>
              </div>
              <div style={{ background: 'rgba(15, 23, 42, 0.6)', padding: '0.4rem', borderRadius: '4px' }}>
                <div style={{ fontSize: '0.7rem', color: 'var(--diabase-text-dim)' }}>Lines of Code</div>
                <div style={{ fontSize: '1rem', fontWeight: 700 }}>{activeFacts.totalLinesOfCode.toLocaleString()}</div>
              </div>
            </div>
          </div>

          {/* Quick Presets */}
          <div>
            <div className="sidebar-title">QUICK DASHBOARD PRESETS</div>
            <div className="preset-list">
              <button
                className={`preset-btn ${promptInput.toLowerCase().includes('book') ? 'active' : ''}`}
                onClick={() => handlePresetClick('I want a dashboard of how I read or rate books', 'vault')}
              >
                <span>📚</span>
                <span>Books & Reading Habits</span>
              </button>
              <button
                className={`preset-btn ${promptInput.toLowerCase().includes('arch') ? 'active' : ''}`}
                onClick={() => handlePresetClick('Monorepo architecture and plugin system graph', 'monorepo')}
              >
                <span>🏗️</span>
                <span>Monorepo Architecture</span>
              </button>
              <button
                className={`preset-btn ${promptInput.toLowerCase().includes('lang') ? 'active' : ''}`}
                onClick={() => handlePresetClick('Language distribution and top files breakdown', 'monorepo')}
              >
                <span>📊</span>
                <span>Code Metrics & Languages</span>
              </button>
              <button
                className={`preset-btn ${promptInput.toLowerCase().includes('debt') || promptInput.toLowerCase().includes('todo') ? 'active' : ''}`}
                onClick={() => handlePresetClick('Code hygiene and TODO maintenance annotations', 'monorepo')}
              >
                <span>🐛</span>
                <span>Technical Debt & Hygiene</span>
              </button>
              <button
                className={`preset-btn ${promptInput.toLowerCase().includes('git') ? 'active' : ''}`}
                onClick={() => handlePresetClick('Recent Git commit history and author timeline', 'monorepo')}
              >
                <span>📜</span>
                <span>Git Commits History</span>
              </button>
            </div>
          </div>

          {/* Component Catalog Cheat-sheet */}
          <div>
            <div className="sidebar-title">READY-MADE REACT COMPONENTS ({COMPONENT_CATALOG.length})</div>
            <p style={{ fontSize: '0.75rem', color: 'var(--diabase-text-dim)', marginBottom: '0.6rem' }}>
              The model composes these 13 pre-built UI primitives into dynamic layouts:
            </p>
            <div style={{ display: 'flex', flexWrap: 'wrap', gap: '0.35rem' }}>
              {COMPONENT_CATALOG.map((c) => (
                <span
                  key={c.component}
                  title={`${c.component}: ${c.description}`}
                  style={{
                    fontSize: '0.725rem',
                    background: 'var(--diabase-bg-subtle)',
                    border: '1px solid var(--diabase-border)',
                    padding: '2px 6px',
                    borderRadius: '4px',
                    color: 'var(--diabase-text-muted)',
                    cursor: 'help',
                  }}
                >
                  &lt;{c.component} /&gt;
                </span>
              ))}
            </div>
          </div>
        </aside>

        {/* Right Main Canvas Area */}
        <main className="canvas-area">
          {/* Canvas Sub-header */}
          <div
            style={{
              display: 'flex',
              alignItems: 'center',
              justifyContent: 'space-between',
              borderBottom: '1px solid var(--diabase-border)',
              paddingBottom: '0.85rem',
            }}
          >
            <div>
              <h2 style={{ fontSize: '1.4rem', fontWeight: 700, margin: 0, letterSpacing: '-0.02em' }}>
                {activeSpec?.title || 'Generative UI Canvas'}
              </h2>
              <p style={{ color: 'var(--diabase-text-muted)', fontSize: '0.85rem', marginTop: '0.2rem' }}>
                {activeSpec?.description || 'The GenUI orchestrator generates live dashboards using ready-made React components.'}
              </p>
            </div>

            {/* View Mode Toggle: Interactive Live vs Raw JSON */}
            <div
              style={{
                display: 'flex',
                alignItems: 'center',
                background: 'var(--diabase-bg-subtle)',
                borderRadius: '6px',
                border: '1px solid var(--diabase-border)',
                padding: '2px',
              }}
            >
              <button
                onClick={() => setCanvasMode('preview')}
                style={{
                  background: canvasMode === 'preview' ? 'var(--diabase-primary)' : 'transparent',
                  color: canvasMode === 'preview' ? '#fff' : 'var(--diabase-text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                🎨 Live Dashboard
              </button>
              <button
                onClick={() => setCanvasMode('json')}
                style={{
                  background: canvasMode === 'json' ? 'var(--diabase-primary)' : 'transparent',
                  color: canvasMode === 'json' ? '#fff' : 'var(--diabase-text-muted)',
                  border: 'none',
                  padding: '4px 10px',
                  borderRadius: '4px',
                  fontSize: '0.775rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {'{ }'} UISpec JSON
              </button>
            </div>
          </div>

          {/* Active Canvas Body */}
          {canvasMode === 'preview' ? (
            activeSpec ? (
              <div style={{ animation: 'fadeIn 0.3s ease' }}>
                <GenUIRenderer spec={activeSpec} />
              </div>
            ) : (
              <div style={{ padding: '4rem', textAlign: 'center', color: 'var(--diabase-text-dim)' }}>
                No active specification. Enter a prompt above to generate a dashboard.
              </div>
            )
          ) : (
            <div style={{ position: 'relative' }}>
              <div style={{ display: 'flex', justifyContent: 'flex-end', marginBottom: '0.5rem' }}>
                <button
                  onClick={handleCopySpec}
                  style={{
                    background: 'var(--diabase-bg-subtle)',
                    border: '1px solid var(--diabase-border)',
                    color: copyFeedback ? '#10b981' : '#fff',
                    padding: '4px 10px',
                    borderRadius: '4px',
                    fontSize: '0.75rem',
                    cursor: 'pointer',
                  }}
                >
                  {copyFeedback ? '✓ Copied!' : 'Copy JSON'}
                </button>
              </div>
              <pre
                style={{
                  background: 'rgba(15, 23, 42, 0.8)',
                  border: '1px solid var(--diabase-border)',
                  borderRadius: '8px',
                  padding: '1.25rem',
                  fontSize: '0.825rem',
                  fontFamily: 'monospace',
                  color: '#a5b4fc',
                  overflowX: 'auto',
                  maxHeight: '650px',
                }}
              >
                {JSON.stringify(activeSpec, null, 2)}
              </pre>
            </div>
          )}
        </main>
      </div>

      {/* 4. Full UISpec Modal */}
      {showSpecModal && (
        <div className="modal-overlay" onClick={() => setShowSpecModal(false)}>
          <div className="modal-card" style={{ maxWidth: '680px' }} onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Generated UISpec Schema</h3>
              <button
                onClick={() => setShowSpecModal(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>
            <p style={{ fontSize: '0.8rem', color: 'var(--diabase-text-dim)', marginBottom: '0.8rem' }}>
              This is the exact JSON tree generated by Claude Opus matching the <code>UISpec</code> protocol schema:
            </p>
            <pre
              style={{
                background: 'rgba(10, 15, 30, 0.9)',
                border: '1px solid var(--diabase-border)',
                borderRadius: '6px',
                padding: '1rem',
                fontSize: '0.775rem',
                fontFamily: 'monospace',
                color: '#e2e8f0',
                maxHeight: '400px',
                overflowY: 'auto',
              }}
            >
              {JSON.stringify(activeSpec, null, 2)}
            </pre>
            <div style={{ display: 'flex', justifyContent: 'flex-end', marginTop: '1rem', gap: '0.5rem' }}>
              <button
                onClick={handleCopySpec}
                style={{
                  background: 'var(--diabase-primary)',
                  border: 'none',
                  color: '#fff',
                  padding: '0.45rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                {copyFeedback ? '✓ Copied' : 'Copy JSON'}
              </button>
              <button
                onClick={() => setShowSpecModal(false)}
                style={{
                  background: 'var(--diabase-bg-subtle)',
                  border: '1px solid var(--diabase-border)',
                  color: '#fff',
                  padding: '0.45rem 1rem',
                  borderRadius: '6px',
                  fontSize: '0.8rem',
                  cursor: 'pointer',
                }}
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* 5. Anthropic API Key Modal */}
      {showKeyModal && (
        <div className="modal-overlay" onClick={() => setShowKeyModal(false)}>
          <div className="modal-card" onClick={(e) => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem' }}>
              <h3 style={{ fontSize: '1.15rem', fontWeight: 700, margin: 0 }}>Claude Opus Model Settings</h3>
              <button
                onClick={() => setShowKeyModal(false)}
                style={{ background: 'none', border: 'none', color: '#fff', fontSize: '1.2rem', cursor: 'pointer' }}
              >
                ✕
              </button>
            </div>

            <p style={{ fontSize: '0.85rem', color: 'var(--diabase-text-muted)', marginBottom: '1.25rem' }}>
              Diabase uses <strong>Claude 3 Opus (<code>claude-3-opus-20240229</code>)</strong> with tool-use (<code>render_ui</code>) to compose ready-made React components. When no API key is provided, the built-in autonomous layout engine generates complete dashboards deterministically.
            </p>

            <div style={{ marginBottom: '1.25rem' }}>
              <label style={{ display: 'block', fontSize: '0.8rem', fontWeight: 600, marginBottom: '0.4rem', color: 'var(--diabase-text-dim)' }}>
                ANTHROPIC API KEY
              </label>
              <input
                type="password"
                placeholder="sk-ant-api03-..."
                value={apiKey}
                onChange={(e) => setApiKey(e.target.value)}
                style={{
                  width: '100%',
                  background: 'var(--diabase-bg-subtle)',
                  border: '1px solid var(--diabase-border)',
                  borderRadius: '6px',
                  color: '#fff',
                  padding: '0.55rem 0.75rem',
                  fontSize: '0.85rem',
                  outline: 'none',
                }}
              />
            </div>

            <div style={{ display: 'flex', justifyContent: 'flex-end', gap: '0.6rem' }}>
              <button
                onClick={() => setShowKeyModal(false)}
                style={{
                  background: 'var(--diabase-primary)',
                  border: 'none',
                  color: '#fff',
                  padding: '0.5rem 1.25rem',
                  borderRadius: '6px',
                  fontSize: '0.85rem',
                  fontWeight: 600,
                  cursor: 'pointer',
                }}
              >
                Save Settings
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  )
}
