import type { Context } from '@diabase/kernel'
import type { VaultEvent } from '@diabase/protocol'
import { pingMain } from '../echo.ts'
import { connectToMain } from '../handshake.ts'
import type { Store } from '../store.ts'
import type { BridgeState, ConsoleStores, EventLogState, FileListState, InspectorState, ServicesState } from './state.ts'

// Each console section is a Cordis plugin that feeds one store; React only reads the stores.
// Stage 2: the sections that show remote data declare `inject: ['vault']` etc. and fill
// their store from the proxy service the Bridge provides.

interface StoreConfig<T> {
  store: Store<T>
}

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : String(error))

/** Handshake with main; stage 1 also proves the port with a ping. Stage 2 plugs the Bridge on the port. */
export function bridgeStatus(ctx: Context, { store }: StoreConfig<BridgeState>) {
  ctx.effect(() => {
    const abort = new AbortController()
    let port: MessagePort | undefined
    void (async () => {
      try {
        port = await connectToMain({ signal: abort.signal })
        store.set((s) => ({ ...s, phase: 'connected', portReceived: true }))
        const echo = await pingMain(port)
        store.set((s) => ({ ...s, echo: 'ok', echoRoundTripMs: echo.roundTripMs, mainPid: echo.mainPid }))
      } catch (error) {
        if (abort.signal.aborted) return
        store.set((s) => ({
          ...s,
          phase: s.portReceived ? s.phase : 'failed',
          echo: 'failed',
          error: errorMessage(error),
        }))
      }
    })()
    return () => {
      abort.abort()
      port?.close()
    }
  })
}

export function servicesList(_ctx: Context, _config: StoreConfig<ServicesState>) {
  // Stage 2: flip an entry to 'up' while its remote service is provided.
}

export function inspectorView(_ctx: Context, _config: StoreConfig<InspectorState>) {
  // Stage 2: inject ['inspector'] and set `refresh` to a call of ctx.inspector's snapshot.
}

export function fileList(_ctx: Context, _config: StoreConfig<FileListState>) {
  // Stage 2: inject ['vault'] and fill from ctx.vault.list('', { recursive: true }).
}

const LOG_LIMIT = 200

export function eventLog(ctx: Context, { store }: StoreConfig<EventLogState>) {
  let nextId = 1
  const push = (event: EventLogState['entries'][number]['event'], detail: string) =>
    store.set((s) => ({
      entries: [...s.entries, { id: nextId++, at: new Date().toISOString(), event, detail }].slice(-LOG_LIMIT),
    }))
  ctx.on('vault/changed', (events) => push('vault/changed', events.map(describeVaultEvent).join(', ')))
  ctx.on('index/updated', (paths) => push('index/updated', paths.join(', ')))
  ctx.on('index/ready', () => push('index/ready', ''))
}

const describeVaultEvent = (e: VaultEvent) =>
  e.type === 'rename' ? `rename ${e.from} -> ${e.to}` : `${e.type} ${e.path}`

export function plugConsole(ctx: Context, stores: ConsoleStores): void {
  ctx.plugin(bridgeStatus, { store: stores.bridge })
  ctx.plugin(servicesList, { store: stores.services })
  ctx.plugin(inspectorView, { store: stores.inspector })
  ctx.plugin(fileList, { store: stores.files })
  ctx.plugin(eventLog, { store: stores.events })
}
