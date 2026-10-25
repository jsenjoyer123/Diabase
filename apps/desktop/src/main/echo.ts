import type { MessagePortMain } from 'electron'

// Stage 1 only: proves the MessagePort handshake end to end. Replaced by the Bridge.
export function serveEcho(port: MessagePortMain): () => void {
  const onMessage = (event: { data: unknown }) => {
    const message = event.data as { type?: unknown; id?: unknown } | null
    if (message?.type === 'diabase:ping') {
      port.postMessage({ type: 'diabase:pong', id: message.id, pid: process.pid })
    }
  }
  port.on('message', onMessage)
  port.start()
  return () => {
    port.off('message', onMessage)
  }
}
