import { Context, messagePortTransport } from '@diabase/kernel'
import type { BridgeTransport, Message } from '@diabase/kernel'

/** Lets queued MessagePort deliveries (and the microtasks they trigger) run. */
export async function flush(turns = 8) {
  for (let i = 0; i < turns; i++) await new Promise<void>((resolve) => setImmediate(resolve))
}

/** Polls until `predicate` is truthy; fails loudly instead of hanging the suite. */
export async function until(predicate: () => unknown, label = 'condition', limit = 500) {
  for (let i = 0; i < limit; i++) {
    if (predicate()) return
    await new Promise<void>((resolve) => setImmediate(resolve))
  }
  throw new Error(`timed out waiting for ${label}`)
}

export interface Pair {
  main: Context
  renderer: Context
  mainPort: MessagePort
  rendererPort: MessagePort
  mainTransport: BridgeTransport
  rendererTransport: BridgeTransport
  close(): void
}

/** Two root contexts joined by a real MessageChannel. Call `close()` in `afterEach`. */
export function createPair(): Pair {
  const { port1, port2 } = new MessageChannel()
  return {
    main: new Context(),
    renderer: new Context(),
    mainPort: port1,
    rendererPort: port2,
    mainTransport: messagePortTransport(port1),
    rendererTransport: messagePortTransport(port2),
    close() {
      port1.close()
      port2.close()
    },
  }
}

/** Collects Cordis log messages at every level (debug included). */
export function captureLogs(ctx: Context): Message[] {
  const messages: Message[] = []
  ctx.logger.exporter({ levels: { default: 3 }, export: (message) => messages.push(message) })
  return messages
}

export interface FakeTransport extends BridgeTransport {
  /** Everything passed to `send`, as seen by the wire (after structured cloning). */
  sent: unknown[]
  messageListeners: number
  closeListeners: number
  closed: boolean
}

/** In-memory transport pair that clones like a real port and counts listeners. */
export function createFakePair(): [FakeTransport, FakeTransport] {
  const make = (): FakeTransport & { peer?: FakeTransport; listeners: Set<(message: unknown) => void>; closers: Set<() => void> } => {
    const self = {
      sent: [] as unknown[],
      closed: false,
      listeners: new Set<(message: unknown) => void>(),
      closers: new Set<() => void>(),
      peer: undefined as FakeTransport | undefined,
      get messageListeners() {
        return self.listeners.size
      },
      get closeListeners() {
        return self.closers.size
      },
      send(message: unknown) {
        const cloned = structuredClone(message)
        self.sent.push(cloned)
        const peer = self.peer as unknown as typeof self
        queueMicrotask(() => {
          for (const listener of [...peer.listeners]) listener(cloned)
        })
      },
      onMessage(listener: (message: unknown) => void) {
        self.listeners.add(listener)
        return () => void self.listeners.delete(listener)
      },
      onClose(listener: () => void) {
        self.closers.add(listener)
        return () => void self.closers.delete(listener)
      },
      close() {
        self.closed = true
      },
    }
    return self
  }
  const a = make()
  const b = make()
  a.peer = b
  b.peer = a
  return [a, b]
}

/**
 * A hand-driven peer on a raw port, for protocol-level tests (malformed input, stale sessions,
 * restarts). Speaks just enough of the wire format to handshake.
 */
export class RawPeer {
  received: Array<Record<string, any>> = []
  bridgeSession?: string

  constructor(
    readonly port: MessagePort,
    readonly session = 'raw-peer',
  ) {
    port.addEventListener('message', (event) => this.received.push((event as MessageEvent).data))
    port.start()
  }

  hello(overrides: Record<string, unknown> = {}) {
    this.port.postMessage({ t: 'hello', s: this.session, v: 1, ack: false, name: 'raw', ...overrides })
  }

  /** Sends a hello and waits for the bridge's ack, learning its session id. */
  async connect(overrides: Record<string, unknown> = {}) {
    this.hello(overrides)
    await until(() => this.received.some((m) => m.t === 'hello' && m.ack), 'bridge ack')
    this.bridgeSession = this.received.find((m) => m.t === 'hello' && m.ack)!.s
  }

  /** Sends an addressed message to the bridge. */
  send(message: Record<string, unknown>) {
    this.port.postMessage({ s: this.session, r: this.bridgeSession, ...message })
  }

  of(type: string) {
    return this.received.filter((m) => m.t === type)
  }
}
