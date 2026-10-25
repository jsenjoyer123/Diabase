// Stage 1 only: a ping/pong over the handshake port, answered by src/main/echo.ts.
export interface EchoResult {
  roundTripMs: number
  mainPid: number
}

export function pingMain(port: MessagePort, timeoutMs = 5_000): Promise<EchoResult> {
  return new Promise((resolve, reject) => {
    const id = crypto.randomUUID()
    const sentAt = performance.now()
    const done = (finish: () => void) => {
      port.removeEventListener('message', onMessage)
      clearTimeout(timer)
      finish()
    }
    const onMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'diabase:pong' || event.data.id !== id) return
      done(() => resolve({ roundTripMs: performance.now() - sentAt, mainPid: event.data.pid }))
    }
    const timer = setTimeout(() => done(() => reject(new Error('echo timed out'))), timeoutMs)
    port.addEventListener('message', onMessage)
    port.start()
    port.postMessage({ type: 'diabase:ping', id })
  })
}
