import type { Context } from '@diabase/kernel'
import type {
  GenUIEvent,
  GenUIRunSummary,
  GenUIService,
  GenUITask,
  RepoFacts,
  UISpec,
} from '@diabase/protocol'
import { validateUISpec } from '@diabase/protocol'
import { LLMService } from '@diabase/plugin-llm'
import { scanRepository, queryRepoFacts } from './repo-scanner.ts'
export { GenUIRenderer, renderNode } from './renderer.tsx'
export { scanRepository, queryRepoFacts } from './repo-scanner.ts'

export class GenUIServiceImpl implements GenUIService {
  private history: GenUIRunSummary[] = []
  private activeRuns = new Map<string, { abort: boolean }>()
  private llm: LLMService
  private ctx?: Context

  constructor(ctx?: Context, llm?: LLMService) {
    this.ctx = ctx
    this.llm = llm || new LLMService()
  }

  async run(task: GenUITask): Promise<{ runId: string; spec?: UISpec }> {
    const runId = `run-${Date.now()}-${Math.random().toString(36).slice(2, 6)}`
    const controller = { abort: false }
    this.activeRuns.set(runId, controller)

    const summary: GenUIRunSummary = {
      runId,
      task,
      status: 'planning',
      startedAt: Date.now(),
      touched: [],
    }
    this.history.unshift(summary)

    this.emit({ runId, type: 'status', status: 'planning', message: 'Analyzing repository structure and code metrics...' })

    try {
      const repoPath = task.repoPath || process.cwd()
      const facts = await scanRepository(repoPath)

      if (controller.abort) {
        summary.status = 'cancelled'
        this.emit({ runId, type: 'status', status: 'cancelled' })
        return { runId }
      }

      summary.status = 'building'
      this.emit({ runId, type: 'status', status: 'building', message: `Generating Generative UI with ${this.llm.defaultModel}...` })

      const { spec } = await this.llm.generateUI(task.prompt, facts)

      const validation = validateUISpec(spec)
      if (!validation.valid || !validation.data) {
        throw new Error(`Generated UISpec failed validation: ${validation.errors.join('; ')}`)
      }

      summary.status = 'done'
      summary.spec = validation.data
      this.emit({ runId, type: 'spec', spec: validation.data })
      this.emit({ runId, type: 'status', status: 'done', message: 'Dashboard generation completed.' })

      return { runId, spec: validation.data }
    } catch (err: any) {
      summary.status = 'failed'
      this.emit({ runId, type: 'status', status: 'failed', message: err.message || 'Run failed' })
      throw err
    } finally {
      this.activeRuns.delete(runId)
    }
  }

  async generateSpec(task: GenUITask): Promise<UISpec> {
    const result = await this.run(task)
    if (!result.spec) {
      throw new Error('Failed to generate UISpec')
    }
    return result.spec
  }

  async cancel(runId: string): Promise<void> {
    const controller = this.activeRuns.get(runId)
    if (controller) {
      controller.abort = true
    }
  }

  async revert(runId: string): Promise<void> {
    const summary = this.history.find((h) => h.runId === runId)
    if (summary) {
      summary.status = 'cancelled'
    }
  }

  async runs(): Promise<GenUIRunSummary[]> {
    return [...this.history]
  }

  private emit(event: GenUIEvent) {
    if (this.ctx && typeof this.ctx.emit === 'function') {
      this.ctx.emit('genui/event', event)
    }
  }
}

/**
 * Cordis plugin application function for @diabase/plugin-genui
 */
export default function apply(ctx: Context) {
  const service = new GenUIServiceImpl(ctx)
  ctx.provide('genui', service)
}
