import type { ReactNode } from 'react'
import { useStore } from '../store.ts'
import type { ConsoleStores } from './state.ts'

const page = { fontFamily: 'ui-monospace, Menlo, Consolas, monospace', fontSize: 13, margin: 16, color: '#111' }
const box = { border: '1px solid #bbb', padding: 8, margin: '0 0 12px' }
const pre = { margin: 0, whiteSpace: 'pre-wrap', wordBreak: 'break-all' } as const

function Section(props: { id: string; title: string; children: ReactNode }) {
  return (
    <section data-testid={props.id} style={box}>
      <h2 style={{ fontSize: 14, margin: '0 0 6px' }}>{props.title}</h2>
      {props.children}
    </section>
  )
}

function BridgeStatusView({ stores }: { stores: ConsoleStores }) {
  const s = useStore(stores.bridge)
  return (
    <Section id="bridge-status" title="bridge status">
      <div data-testid="bridge-phase">phase: {s.phase}</div>
      <div data-testid="port-received">port received: {s.portReceived ? 'yes' : 'no'}</div>
      <div data-testid="echo-result">
        echo: {s.echo}
        {s.echo === 'ok' && ` (${s.echoRoundTripMs?.toFixed(1)} ms, main pid ${s.mainPid})`}
      </div>
      <div data-testid="remote-services">
        remote services up: {s.remoteServices.length ? s.remoteServices.join(', ') : 'none'}
      </div>
      {s.error && <div data-testid="bridge-error">error: {s.error}</div>}
    </Section>
  )
}

function ServicesView({ stores }: { stores: ConsoleStores }) {
  const s = useStore(stores.services)
  return (
    <Section id="services" title="services">
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {s.entries.map((entry) => (
          <li key={entry.name} data-service={entry.name} data-status={entry.status}>
            {entry.name}: {entry.status === 'up' ? 'up' : 'waiting for bridge'}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function InspectorView({ stores }: { stores: ConsoleStores }) {
  const s = useStore(stores.inspector)
  return (
    <Section id="inspector" title="inspector">
      <button type="button" data-testid="inspector-refresh" disabled={!s.refresh} onClick={() => s.refresh?.()}>
        refresh
      </button>
      <pre data-testid="inspector-snapshot" style={pre}>
        {s.status === 'waiting' && 'waiting for bridge'}
        {s.status === 'loading' && 'loading...'}
        {s.status === 'failed' && `failed: ${s.error}`}
        {s.snapshot !== undefined && JSON.stringify(s.snapshot, null, 2)}
      </pre>
    </Section>
  )
}

function FileListView({ stores }: { stores: ConsoleStores }) {
  const s = useStore(stores.files)
  return (
    <Section id="file-list" title="vault files">
      {s.status === 'waiting' && <div>waiting for bridge</div>}
      {s.status === 'loading' && <div>loading...</div>}
      {s.status === 'failed' && <div>failed: {s.error}</div>}
      {s.status === 'ready' && s.files.length === 0 && <div>no files</div>}
      <ul style={{ margin: 0, paddingLeft: 18 }}>
        {s.files.map((file) => (
          <li key={file} data-testid="file-item">
            {file}
          </li>
        ))}
      </ul>
    </Section>
  )
}

function EventLogView({ stores }: { stores: ConsoleStores }) {
  const s = useStore(stores.events)
  return (
    <Section id="event-log" title="event log">
      {s.entries.length === 0 && <div>no events yet</div>}
      <ol style={{ margin: 0, paddingLeft: 24 }}>
        {s.entries.map((entry) => (
          <li key={entry.id} data-testid="event-entry" data-event={entry.event}>
            {entry.at} {entry.event} {entry.detail}
          </li>
        ))}
      </ol>
    </Section>
  )
}

export function ConsolePage({ stores }: { stores: ConsoleStores }) {
  return (
    <main style={page}>
      <h1 style={{ fontSize: 16, margin: '0 0 12px' }}>Diabase backend console</h1>
      <BridgeStatusView stores={stores} />
      <ServicesView stores={stores} />
      <InspectorView stores={stores} />
      <FileListView stores={stores} />
      <EventLogView stores={stores} />
    </main>
  )
}
