import { createStore } from '../store.ts'
import type { Store } from '../store.ts'

/** Main-process services the console will list once the Bridge imports them (stage 2). */
export const EXPECTED_SERVICES = ['vault', 'index', 'search', 'bundler', 'inspector', 'loader'] as const

export interface BridgeState {
  phase: 'connecting' | 'connected' | 'failed'
  portReceived: boolean
  echo: 'pending' | 'ok' | 'failed'
  echoRoundTripMs?: number
  mainPid?: number
  error?: string
  /** Remote services that are up (filled by the Bridge in stage 2). */
  remoteServices: string[]
}

export interface ServicesState {
  entries: { name: string; status: 'waiting' | 'up' }[]
}

export interface InspectorState {
  status: 'waiting' | 'idle' | 'loading' | 'failed'
  snapshot?: unknown
  error?: string
  /** Set by the inspector plugin once its remote service is available. */
  refresh?: () => void
}

export interface FileListState {
  status: 'waiting' | 'loading' | 'ready' | 'failed'
  files: string[]
  error?: string
}

export interface LogEntry {
  id: number
  at: string
  event: 'vault/changed' | 'index/updated' | 'index/ready'
  detail: string
}

export interface EventLogState {
  entries: LogEntry[]
}

export interface ConsoleStores {
  bridge: Store<BridgeState>
  services: Store<ServicesState>
  inspector: Store<InspectorState>
  files: Store<FileListState>
  events: Store<EventLogState>
}

export function createConsoleStores(): ConsoleStores {
  return {
    bridge: createStore<BridgeState>({
      phase: 'connecting',
      portReceived: false,
      echo: 'pending',
      remoteServices: [],
    }),
    services: createStore<ServicesState>({
      entries: EXPECTED_SERVICES.map((name) => ({ name, status: 'waiting' })),
    }),
    inspector: createStore<InspectorState>({ status: 'waiting' }),
    files: createStore<FileListState>({ status: 'waiting', files: [] }),
    events: createStore<EventLogState>({ entries: [] }),
  }
}
