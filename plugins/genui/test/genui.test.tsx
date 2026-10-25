// @vitest-environment happy-dom
import { describe, expect, it } from 'vitest'
import { createElement } from 'react'
import { renderToString } from 'react-dom/server'
import {
  GenUIRenderer,
  GenUIServiceImpl,
  scanRepository,
  queryRepoFacts,
} from '../src/index.ts'
import type { UISpec } from '@diabase/protocol'

describe('plugins/genui', () => {
  it('scans the repository and extracts structure, languages, and metrics', async () => {
    const facts = await scanRepository('.')

    expect(facts.name).toBeTruthy()
    expect(facts.totalFiles).toBeGreaterThan(0)
    expect(facts.totalLinesOfCode).toBeGreaterThan(0)
    expect(facts.languages.length).toBeGreaterThan(0)

    // Check queryRepoFacts
    const summary = queryRepoFacts({ kind: 'summary', params: {} }, facts) as any
    expect(summary.totalFiles).toBe(facts.totalFiles)
    expect(summary.totalLinesOfCode).toBe(facts.totalLinesOfCode)
  })

  it('runs GenUIServiceImpl end-to-end to produce a valid UISpec', async () => {
    const service = new GenUIServiceImpl()
    const { runId, spec } = await service.run({
      prompt: 'Show me an overview of the investigated repository',
      repoPath: '.',
    })

    expect(runId).toBeTruthy()
    expect(spec).toBeDefined()
    expect(spec?.title).toBeTruthy()
    expect(spec?.root.component).toBe('Grid')

    const runs = await service.runs()
    expect(runs.length).toBe(1)
    expect(runs[0]?.status).toBe('done')
  })

  it('renders generated UISpec with GenUIRenderer into React HTML', async () => {
    const service = new GenUIServiceImpl()
    const { spec } = await service.run({
      prompt: 'Show repository architecture and packages',
      repoPath: '.',
    })

    expect(spec).toBeDefined()
    const html = renderToString(createElement(GenUIRenderer, { spec: spec as UISpec }))

    expect(html).toContain('Architecture')
    expect(html).toContain('db-card')
  })

  it('handles unknown components gracefully with fallback warning', () => {
    const brokenSpec: UISpec = {
      version: '1.0.0',
      title: 'Broken View',
      root: {
        component: 'NonExistentWidget' as any,
        props: {},
      },
    }

    const html = renderToString(createElement(GenUIRenderer, { spec: brokenSpec }))
    expect(html).toContain('Unknown Component')
    expect(html).toContain('NonExistentWidget')
  })
})
