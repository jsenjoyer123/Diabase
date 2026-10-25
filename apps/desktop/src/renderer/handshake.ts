export interface ConnectOptions {
  /** Reject if main does not hand over a port in time. Default 10s. */
  timeoutMs?: number
  signal?: AbortSignal
  /** Injectable for tests. */
  win?: Pick<Window, 'addEventListener' | 'removeEventListener'> & { diabase: DiabaseBridge }
}

/**
 * Port handshake, renderer side. The preload re-posts the MessagePort from main to this window
 * as `{ type: 'diabase:port' }`; we listen first, then ask main for it. The listener and the
 * timer are always removed, whichever way the promise settles.
 */
export function connectToMain(options: ConnectOptions = {}): Promise<MessagePort> {
  const { timeoutMs = 10_000, signal } = options
  const win = options.win ?? window

  return new Promise<MessagePort>((resolve, reject) => {
    if (signal?.aborted) return reject(abortError())

    const settle = (finish: () => void) => {
      win.removeEventListener('message', onMessage)
      signal?.removeEventListener('abort', onAbort)
      clearTimeout(timer)
      finish()
    }
    const onMessage = (event: Event) => {
      const { source, data, ports } = event as MessageEvent
      const port = ports[0]
      if (source !== win || data?.type !== 'diabase:port' || !port) return
      settle(() => resolve(port))
    }
    const onAbort = () => settle(() => reject(abortError()))
    const timer = setTimeout(
      () => settle(() => reject(new Error(`no MessagePort from main within ${timeoutMs}ms`))),
      timeoutMs,
    )

    win.addEventListener('message', onMessage)
    signal?.addEventListener('abort', onAbort)
    win.diabase.connect()
  })
}

const abortError = () => new DOMException('connectToMain aborted', 'AbortError')
