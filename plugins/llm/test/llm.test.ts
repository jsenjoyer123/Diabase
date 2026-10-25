import { describe, expect, it } from 'vitest'
import { LLMService } from '../src/index.ts'
import { validateUISpec } from '@diabase/protocol'
import type { RepoFacts } from '@diabase/protocol'

const mockFacts: RepoFacts = {
  name: 'Diabase',
  rootPath: '/home/user/Documents/Diabase-GenUI',
  branch: 'main',
  totalFiles: 85,
  totalLinesOfCode: 15400,
  languages: [
    { language: 'TypeScript', extension: '.ts', files: 50, lines: 11000, percentage: 71 },
    { language: 'Markdown', extension: '.md', files: 20, lines: 3400, percentage: 22 },
    { language: 'JSON', extension: '.json', files: 15, lines: 1000, percentage: 7 },
  ],
  recentCommits: [
    { hash: 'a1b2c3d', message: 'feat: add generative ui', author: 'Team', date: '2 hours ago' },
  ],
  topFiles: [
    { path: 'packages/kernel/src/main/loader.ts', lines: 350, sizeBytes: 12000, language: 'TypeScript' },
  ],
  todos: [
    { file: 'plugins/bundler/src/compile.ts', line: 42, type: 'TODO', text: 'Optimize cache' },
  ],
  dependencies: [
    { name: 'cordis', version: '4.0.0-rc.12', type: 'prod' },
  ],
  structure: {
    packages: ['kernel', 'protocol', 'ui'],
    plugins: ['llm', 'genui'],
    apps: ['desktop'],
  },
}

describe('LLMService (Claude Opus support & fallback)', () => {
  it('instantiates with Claude Opus as default model', () => {
    const service = new LLMService()
    expect(service.defaultModel).toBe('claude-3-opus-20240229')
  })

  it('generates a valid UISpec for an overview prompt', async () => {
    const service = new LLMService()
    const result = await service.generateUI('Show me an overview of the codebase', mockFacts)

    expect(result.spec).toBeDefined()
    expect(result.spec.title).toContain('Diabase')
    expect(result.modelUsed).toContain('claude-3-opus')

    const validation = validateUISpec(result.spec)
    expect(validation.valid).toBe(true)
    expect(validation.errors).toEqual([])
  })

  it('generates a valid UISpec for an architecture prompt', async () => {
    const service = new LLMService()
    const result = await service.generateUI('Show architecture, modules, and graph', mockFacts)

    expect(result.spec).toBeDefined()
    expect(result.spec.title).toContain('Architecture')

    const validation = validateUISpec(result.spec)
    expect(validation.valid).toBe(true)
  })

  it('generates a valid UISpec for a git history prompt', async () => {
    const service = new LLMService()
    const result = await service.generateUI('Show recent commits and git history', mockFacts)

    expect(result.spec).toBeDefined()
    expect(result.spec.title).toContain('Git')

    const validation = validateUISpec(result.spec)
    expect(validation.valid).toBe(true)
  })

  it('generates a valid UISpec for technical debt and todos', async () => {
    const service = new LLMService()
    const result = await service.generateUI('Audit code health, todos, and tech debt', mockFacts)

    expect(result.spec).toBeDefined()
    expect(result.spec.title).toContain('Health')

    const validation = validateUISpec(result.spec)
    expect(validation.valid).toBe(true)
  })
})
