// Transports are structural so the kernel never imports `electron` and the same file bundles
// into the renderer.

export interface BridgeTransport {
  /** May throw (e.g. `DataCloneError`); the bridge turns that into an `EDATACLONE` rejection. */
  send(message: unknown, transfer?: Transferable[]): void
  /** Returns an unsubscribe function. */
  onMessage(listener: (message: unknown) => void): () => void
  /** Peer or port closed, where detectable. Returns an unsubscribe function. */
  onClose?(listener: () => void): () => void
  /** Only called when the bridge owns the transport (`ownsTransport`). */
  close?(): void
}

/** DOM `MessagePort` (renderer) and Node's global `MessageChannel` ports. Starts the port. */
export function messagePortTransport(port: MessagePort): BridgeTransport {
  return {
    send: (message, transfer) => port.postMessage(message, transfer ?? []),
    onMessage(listener) {
      const handler = (event: Event) => listener((event as MessageEvent).data)
      port.addEventListener('message', handler)
      port.start()
      return () => port.removeEventListener('message', handler)
    },
    onClose(listener) {
      port.addEventListener('close', listener)
      return () => port.removeEventListener('close', listener)
    },
    close: () => port.close(),
  }
}

/** The subset of Electron's `MessagePortMain` the bridge needs. */
export interface MessagePortMainLike {
  postMessage(message: unknown, transfer?: unknown[]): void
  start(): void
  close(): void
  on(event: 'message', listener: (event: { data: unknown; ports?: unknown[] }) => void): unknown
  on(event: 'close', listener: () => void): unknown
  removeListener(event: 'message', listener: (event: { data: unknown; ports?: unknown[] }) => void): unknown
  removeListener(event: 'close', listener: () => void): unknown
}

/** Electron main-process `MessagePortMain`. Starts the port. */
export function electronPortTransport(port: MessagePortMainLike): BridgeTransport {
  return {
    send: (message, transfer) => (transfer?.length ? port.postMessage(message, transfer) : port.postMessage(message)),
    onMessage(listener) {
      const handler = (event: { data: unknown }) => listener(event.data)
      port.on('message', handler)
      port.start()
      return () => {
        port.removeListener('message', handler)
      }
    },
    onClose(listener) {
      port.on('close', listener)
      return () => {
        port.removeListener('close', listener)
      }
    },
    close: () => port.close(),
  }
}
