// Generative UI task agent contract (main-process service `ctx.genui`).
import type { BlockManifest } from './blocks.ts'
import type { LayoutOp } from './layout.ts'
import type { NoteQuery } from './query.ts'
import type { VaultPath } from './vault.ts'

export * from './genui-spec.ts'

import type { UISpec } from './genui-spec.ts'

export interface GenUITask {
  prompt: string
  /** Target repository path to analyze (defaults to current project). */
  repoPath?: string
  /** Edit the current workspace, or create a new one (default). */
  target?: { kind: 'new' } | { kind: 'current' } | { kind: 'workspace'; path: VaultPath }
}

export type FulfillStrategy = 'compose' | 'subset' | 'reuse' | 'author'

export interface GenUIPlanItem {
  id: string
  purpose: string
  strategy: FulfillStrategy
  /** Existing block type to reuse/subset, when applicable. */
  baseType?: string
  /** Target slot node id in the planned layout. */
  slot: string
  data?: NoteQuery
}

export interface GenUIPlan {
  summary: string
  items: GenUIPlanItem[]
}

export type GenUIRunStatus = 'planning' | 'building' | 'applying' | 'done' | 'failed' | 'cancelled'

export type GenUIEvent =
  | { runId: string; type: 'status'; status: GenUIRunStatus; message?: string }
  | { runId: string; type: 'plan'; plan: GenUIPlan }
  | { runId: string; type: 'item'; itemId: string; state: 'started' | 'done' | 'failed'; message?: string }
  | { runId: string; type: 'spec'; spec: UISpec }
  | { runId: string; type: 'block'; manifest: BlockManifest }
  | { runId: string; type: 'layout'; ops: LayoutOp[] }
  | { runId: string; type: 'log'; level: 'debug' | 'info' | 'warn' | 'error'; message: string }

export interface GenUIRunSummary {
  runId: string
  task: GenUITask
  status: GenUIRunStatus
  startedAt: number
  /** Workspace written by the run, if any. */
  workspace?: VaultPath
  /** Generated UI specification, if run succeeded. */
  spec?: UISpec
  /** Vault paths created or modified (for revert). */
  touched: VaultPath[]
}

export interface GenUIService {
  run(task: GenUITask): Promise<{ runId: string; spec?: UISpec }>
  generateSpec(task: GenUITask): Promise<UISpec>
  cancel(runId: string): Promise<void>
  /** Restore every file the run touched and the previous workspace. */
  revert(runId: string): Promise<void>
  runs(): Promise<GenUIRunSummary[]>
}
