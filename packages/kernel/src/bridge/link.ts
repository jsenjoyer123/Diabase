import type { Context, Logger } from '../index.ts'
import { REMOTE_MARKER } from '../remote.ts'
import type { RemoteMarker } from '../remote.ts'
import type { BridgeConfig, BridgeGuard, BridgeStatus, ExposeOptions } from './config.ts'
import { BridgeError, deserializeError, isCloneError, serializeError } from './errors.ts'
import type { BridgeErrorCode, SerializedError } from './errors.ts'
import { discoverMethods, isMethodName } from './methods.ts'
import type { BridgeTransport } from './transport.ts'
import { PROTOCOL_VERSION, parseWireMessage } from './wire.ts'
import type {
  Body,
  CallMessage,
  DownMessage,
  EventMessage,
  HelloMessage,
  ReleasedMessage,
  ResultMessage,
  UpMessage,
  WireMessage,
} from './wire.ts'

const DEFAULT_TIMEOUT = 30_000
const DEFAULT_RELEASE_TIMEOUT = 10_000

/** A local service served to the peer. Lives exactly as long as the `ctx.inject` fiber of its origin. */
interface Exposure {
  name: string
  /** Distinguishes activations: a late `released` for an older one must not satisfy a newer wait. */
  gen: number
  service: unknown
  methods: Set<string>
  guard?: BridgeGuard
  /** `draining`: the origin is leaving; calls are still served until the peer releases it. */
  phase: 'up' | 'draining'
  release?: () => void
}

/** The proxy provided for one `up` announcement. */
interface ProxyHandle {
  gen: number
  remote: string
  local: string
  /** `draining` (peer announced `down`, local dependents are leaving) is still callable. */
  state: 'live' | 'draining' | 'closed'
  code?: BridgeErrorCode
  calls: Set<number>
  /** Withdraws the Cordis provision; idempotent. Resolves once local dependents have released it. */
  dispose: () => Promise<void>
}

interface ImportState {
  remote: string
  local: string
  handle?: ProxyHandle
  /** Last processed generation is scoped to a peer session. */
  session?: string
  generation?: number
  /** Serializes up/down transitions so a fast down -> up never double-registers the service. */
  chain: Promise<void>
}

interface PendingCall {
  handle: ProxyHandle
  resolve(value: unknown): void
  reject(error: Error): void
  timer?: ReturnType<typeof setTimeout>
}

interface LooseEvents {
  on(name: string, listener: (...args: any[]) => void): unknown
  emit(name: string, ...args: unknown[]): void
}

function randomSession(): string {
  return globalThis.crypto?.randomUUID?.() ?? `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`
}

function named<T extends object>(target: T, name: string): T {
  return Object.defineProperty(target, 'name', { value: name })
}

function messageOf(error: unknown): string {
  return error instanceof Error ? error.message : String(error)
}

function eventNames(names: string[] | undefined, kind: string, logger: Logger): string[] {
  return (names ?? []).filter((name) => {
    if (!name.startsWith('internal/')) return true
    logger.warn(`refusing to ${kind} internal event "${name}"`)
    return false
  })
}

/**
 * One end of an IPC bridge. Constructed per `Bridge` fiber; see `attach()` and `start()` for
 * the two phases. All state is instance-local so any number of bridges can coexist.
 */
export class BridgeLink {
  private readonly session = randomSession()
  private readonly name: string
  private readonly logger: Logger
  private readonly transport: BridgeTransport
  private readonly exposeOptions: ExposeOptions[] = []
  private readonly imports: ImportState[] = []
  private readonly importsByRemote = new Map<string, ImportState>()
  private readonly forward: string[]
  private readonly accept: Set<string>
  private readonly timeout: number
  private readonly timeouts: Record<string, number>
  private readonly releaseTimeout: number
  private readonly ownsTransport: boolean

  private readonly exposures = new Map<string, Exposure>()
  private readonly calls = new Map<number, PendingCall>()
  private readonly releaseWaiters = new Set<() => void>()
  private peer: { session: string; name: string } | null = null
  private closed = false
  private reemitting?: string
  private callSeq = 0
  private generation = 0
  private mismatchLogged?: string

  constructor(
    private readonly ctx: Context,
    config: BridgeConfig,
  ) {
    this.name = config.name ?? 'bridge'
    this.logger = ctx.logger(this.name === 'bridge' ? 'bridge' : `bridge:${this.name}`)
    this.transport = config.transport
    this.timeout = config.timeout ?? DEFAULT_TIMEOUT
    this.timeouts = config.timeouts ?? {}
    this.releaseTimeout = config.releaseTimeout ?? DEFAULT_RELEASE_TIMEOUT
    this.ownsTransport = config.ownsTransport ?? false
    this.forward = eventNames(config.forward, 'forward', this.logger)
    this.accept = new Set(eventNames(config.accept, 'accept', this.logger))

    for (const entry of config.expose ?? []) {
      const options = typeof entry === 'string' ? { name: entry } : entry
      if (this.exposeOptions.some((other) => other.name === options.name)) {
        throw new Error(`service "${options.name}" is exposed twice`)
      }
      this.exposeOptions.push(options)
    }
    for (const entry of config.import ?? []) {
      const { name, as } = typeof entry === 'string' ? { name: entry, as: entry } : entry
      if (this.importsByRemote.has(name) || this.imports.some((other) => other.local === as)) {
        throw new Error(`service "${name}" (as "${as}") is imported twice`)
      }
      if (this.exposeOptions.some((other) => other.name === as)) {
        throw new Error(`"${as}" is both exposed and imported by bridge "${this.name}"`)
      }
      const state: ImportState = { remote: name, local: as, chain: Promise.resolve() }
      this.imports.push(state)
      this.importsByRemote.set(name, state)
    }
  }

  private get events(): LooseEvents {
    return this.ctx as unknown as LooseEvents
  }

  /** The bridge is being torn down: stop accepting new work, but keep serving what is draining. */
  private get closing(): boolean {
    return this.closed || this.ctx.fiber.uid === null
  }

  status(): BridgeStatus {
    return {
      name: this.name,
      connected: this.peer !== null,
      remote: this.imports.map((imp) => ({ name: imp.remote, local: imp.local, up: imp.handle?.state === 'live' })),
      exposed: this.peer
        ? [...this.exposures.values()].filter((exposure) => exposure.phase === 'up').map((exposure) => exposure.name)
        : [],
    }
  }

  // ---- setup ------------------------------------------------------------------------------

  /** Registers the event forwarders and the per-service `inject` fibers (all Cordis effects). */
  attach() {
    for (const name of this.forward) {
      this.events.on(name, (...args: unknown[]) => this.forwardEvent(name, args))
    }
    for (const options of this.exposeOptions) this.attachExposure(options)
  }

  /**
   * Subscribes to the transport and starts the handshake. Returns the single, ordered teardown
   * (Cordis runs separate disposers concurrently, so none of this may be split across effects).
   */
  start(): () => Promise<void> {
    const unsubscribe = [
      this.transport.onMessage((message) => this.receive(message)),
      this.transport.onClose?.(() => this.disconnect('EDISCONNECTED')),
    ]
    this.hello(false)
    return () => this.teardown(unsubscribe)
  }

  private async teardown(unsubscribe: Array<(() => void) | undefined>) {
    this.closed = true
    if (this.peer) this.trySend({ t: 'bye', s: this.session })
    for (const off of unsubscribe) {
      try {
        off?.()
      } catch (error) {
        this.logger.error(error)
      }
    }
    this.disconnect('EDISPOSED')
    await Promise.all(this.imports.map((imp) => imp.handle?.dispose()))
    if (this.ownsTransport) {
      try {
        this.transport.close?.()
      } catch (error) {
        this.logger.error(error)
      }
    }
  }

  // ---- sending ----------------------------------------------------------------------------

  private post(body: Body) {
    if (!this.peer) throw new BridgeError('EDISCONNECTED', `bridge "${this.name}" is not connected`)
    this.transport.send({ ...body, s: this.session, r: this.peer.session })
  }

  private trySend(message: WireMessage) {
    try {
      this.transport.send(message)
    } catch (error) {
      this.logger.warn(`cannot send ${message.t}: ${messageOf(error)}`)
    }
  }

  private tryPost(body: Body) {
    try {
      this.post(body)
    } catch (error) {
      this.logger.warn(`cannot send ${body.t}: ${messageOf(error)}`)
    }
  }

  private emitStatus() {
    try {
      this.ctx.emit('bridge/status', this.status())
    } catch (error) {
      this.logger.error(error)
    }
  }

  // ---- receiving --------------------------------------------------------------------------

  private receive(raw: unknown) {
    if (this.closed) return
    try {
      const message = parseWireMessage(raw)
      if (message) this.dispatch(message)
      else this.logger.debug('EPROTOCOL: ignoring malformed message')
    } catch (error) {
      this.logger.error(error)
    }
  }

  private dispatch(message: WireMessage) {
    if (message.t === 'hello') return this.onHello(message)
    if (message.t === 'bye') {
      if (message.s === this.peer?.session) this.disconnect('EDISCONNECTED')
      return
    }
    if (!this.peer || message.s !== this.peer.session || message.r !== this.session) {
      this.logger.debug(`ignoring ${message.t} from a stale session`)
      return
    }
    switch (message.t) {
      case 'up':
        return this.onUp(message, this.peer.session)
      case 'down':
        return this.onDown(message, this.peer.session)
      case 'released':
        return this.onReleased(message)
      case 'call':
        return void this.serve(message, this.peer.session)
      case 'result':
        return this.onResult(message)
      case 'event':
        return this.onEvent(message)
    }
  }

  // ---- connection -------------------------------------------------------------------------

  private hello(ack: boolean) {
    this.trySend({ t: 'hello', s: this.session, v: PROTOCOL_VERSION, ack, name: this.name })
  }

  private onHello(message: HelloMessage) {
    if (message.v !== PROTOCOL_VERSION) {
      if (this.peer && this.peer.session !== message.s) this.disconnect('EDISCONNECTED')
      if (this.mismatchLogged !== message.s) {
        this.mismatchLogged = message.s
        this.logger.error(
          `protocol version mismatch with "${message.name}": local ${PROTOCOL_VERSION}, remote ${message.v}; staying disconnected`,
        )
      }
      return
    }
    // A fresh hello always gets exactly one ack; an ack never gets a reply, so this cannot loop.
    if (this.peer?.session === message.s) {
      if (!message.ack) this.hello(true)
      return
    }
    // A new session id means the previous peer instance is gone.
    if (this.peer) this.disconnect('EDISCONNECTED')
    this.peer = { session: message.s, name: message.name }
    if (!message.ack) this.hello(true)
    this.logger.debug(`connected to "${message.name}"`)
    for (const exposure of this.exposures.values()) {
      if (exposure.phase === 'up') this.announce(exposure)
    }
    this.emitStatus()
  }

  private disconnect(code: BridgeErrorCode) {
    const wasConnected = this.peer !== null
    this.peer = null
    for (const imp of this.imports) {
      imp.session = undefined
      imp.generation = undefined
      const handle = imp.handle
      if (!handle) continue
      // Immediate: calls fail and dependents leave now; the awaited part follows on the chain.
      this.closeHandle(handle, code)
      void handle.dispose()
      this.enqueue(imp, () => this.withdraw(imp, code))
    }
    for (const id of [...this.calls.keys()]) {
      this.settle(id)?.reject(this.downError(code))
    }
    for (const release of [...this.releaseWaiters]) release()
    if (wasConnected) {
      this.logger.debug('disconnected')
      this.emitStatus()
    }
  }

  private alive(session: string): boolean {
    return !this.closed && this.peer?.session === session
  }

  // ---- exposing side ----------------------------------------------------------------------

  private attachExposure(options: ExposeOptions) {
    const apply = (inner: Context) => {
      const service = (inner as unknown as Record<string, unknown>)[options.name]
      if (typeof service !== 'object' && typeof service !== 'function') {
        throw new TypeError(`cannot expose "${options.name}": not an object`)
      }
      if (service === null) throw new TypeError(`cannot expose "${options.name}": not an object`)
      const methods = (options.methods ?? discoverMethods(service)).filter(isMethodName)
      const exposure: Exposure = {
        name: options.name,
        gen: ++this.generation,
        service,
        methods: new Set(methods),
        guard: options.guard,
        phase: 'up',
      }
      this.exposures.set(exposure.name, exposure)
      if (this.peer) {
        this.announce(exposure)
        this.emitStatus()
      }
      return () => this.retire(exposure)
    }
    this.ctx.inject([options.name], named(apply, `bridge:${this.name}:expose:${options.name}`))
  }

  private announce(exposure: Exposure) {
    this.tryPost({ t: 'up', name: exposure.name, gen: exposure.gen, methods: [...exposure.methods] })
  }

  /**
   * Disposer of the expose fiber: the origin service is leaving. Tell the peer, keep serving its
   * calls, and hold the origin's unload until the peer's dependents are done (or it gives up).
   */
  private async retire(exposure: Exposure) {
    exposure.phase = 'draining'
    try {
      if (!this.peer || this.closing) return
      const released = this.releaseTimeout > 0 ? this.awaitRelease(exposure) : undefined
      this.tryPost({ t: 'down', name: exposure.name, gen: exposure.gen })
      this.emitStatus()
      await released
    } finally {
      exposure.release?.()
      if (this.exposures.get(exposure.name) === exposure) this.exposures.delete(exposure.name)
    }
  }

  /** Resolves on the peer's `released`, on `releaseTimeout`, or when the connection ends. */
  private awaitRelease(exposure: Exposure): Promise<void> {
    return new Promise<void>((resolve) => {
      const done = () => {
        clearTimeout(timer)
        this.releaseWaiters.delete(done)
        exposure.release = undefined
        resolve()
      }
      const timer = setTimeout(() => {
        this.logger.warn(`peer did not release "${exposure.name}" within ${this.releaseTimeout}ms`)
        done()
      }, this.releaseTimeout)
      exposure.release = done
      this.releaseWaiters.add(done)
    })
  }

  private onReleased(message: ReleasedMessage) {
    const exposure = this.exposures.get(message.name)
    if (exposure?.gen === message.gen) exposure.release?.()
  }

  private async serve(message: CallMessage, session: string) {
    let reply: Body<ResultMessage>
    try {
      const exposure = this.exposures.get(message.name)
      if (!exposure) throw new BridgeError('ENOSERVICE', `service "${message.name}" is not available`)
      if (!exposure.methods.has(message.method)) {
        throw new BridgeError('ENOMETHOD', `service "${message.name}" has no method "${message.method}"`)
      }
      const method = (exposure.service as Record<string, unknown>)[message.method]
      if (typeof method !== 'function') {
        throw new BridgeError('ENOMETHOD', `service "${message.name}" has no method "${message.method}"`)
      }
      await exposure.guard?.(message.method, message.args)
      const value = await Reflect.apply(method, exposure.service, message.args)
      reply = { t: 'result', id: message.id, ok: true, value }
    } catch (error) {
      reply = { t: 'result', id: message.id, ok: false, error: serializeError(error) }
    }
    if (!this.alive(session)) return
    try {
      this.post(reply)
    } catch (error) {
      if (!reply.ok) return void this.logger.warn(`cannot send result of call ${message.id}: ${messageOf(error)}`)
      const failure = new BridgeError(
        'EDATACLONE',
        `result of ${message.name}.${message.method} cannot be cloned: ${messageOf(error)}`,
      )
      this.tryPost({ t: 'result', id: message.id, ok: false, error: serializeError(failure) })
    }
  }

  // ---- importing side ---------------------------------------------------------------------

  private enqueue(imp: ImportState, task: () => Promise<void>) {
    imp.chain = imp.chain.then(task).catch((error) => this.logger.error(error))
  }

  private onUp(message: UpMessage, session: string) {
    const imp = this.importsByRemote.get(message.name)
    if (!imp) {
      this.logger.debug(`ignoring announcement of un-imported service "${message.name}"`)
      return
    }
    const methods = message.methods.filter(isMethodName)
    this.enqueue(imp, async () => {
      if (!this.alive(session) || this.closing) return
      if (imp.session !== session) {
        imp.session = session
        imp.generation = undefined
      }
      if (imp.generation !== undefined && message.gen <= imp.generation) {
        this.logger.debug(`ignoring stale up for "${message.name}" generation ${message.gen}`)
        return
      }
      if (imp.handle) {
        await this.withdraw(imp, 'ESERVICEDOWN')
        if (!this.alive(session) || this.closing) return
      }
      imp.generation = message.gen
      this.provide(imp, message.gen, methods)
    })
  }

  private onDown(message: DownMessage, session: string) {
    const imp = this.importsByRemote.get(message.name)
    if (!imp) {
      this.tryPost({ t: 'released', name: message.name, gen: message.gen })
      return
    }
    this.enqueue(imp, async () => {
      if (!this.alive(session) || this.closing) return
      if (imp.session !== session) {
        imp.session = session
        imp.generation = undefined
      }
      if (imp.generation === undefined || message.gen > imp.generation) imp.generation = message.gen
      if (imp.handle?.gen === message.gen) await this.withdraw(imp, 'ESERVICEDOWN')
      if (this.alive(session)) this.tryPost({ t: 'released', name: message.name, gen: message.gen })
    })
  }

  private provide(imp: ImportState, gen: number, methods: string[]) {
    const handle: ProxyHandle = {
      gen,
      remote: imp.remote,
      local: imp.local,
      state: 'live',
      calls: new Set(),
      dispose: () => Promise.resolve(),
    }
    let release: () => unknown
    try {
      release = this.ctx.provide(imp.local, this.createProxy(handle, methods))
    } catch (error) {
      this.logger.error(`cannot provide "${imp.local}": ${messageOf(error)}`)
      return
    }
    let disposal: Promise<void> | undefined
    handle.dispose = () =>
      (disposal ??= (async () => {
        try {
          await release()
        } catch (error) {
          this.logger.error(error)
        }
      })())
    imp.handle = handle
    this.emitStatus()
  }

  /** Takes the proxy away from Cordis (its dependents leave), then fails whatever is still pending. */
  private async withdraw(imp: ImportState, code: BridgeErrorCode) {
    const handle = imp.handle
    if (!handle) return
    if (handle.state === 'live') {
      handle.state = 'draining'
      this.emitStatus()
    }
    await handle.dispose()
    this.closeHandle(handle, code)
    if (imp.handle === handle) imp.handle = undefined
  }

  private closeHandle(handle: ProxyHandle, code: BridgeErrorCode) {
    if (handle.state === 'closed') return
    handle.state = 'closed'
    handle.code = code
    for (const id of [...handle.calls]) this.settle(id)?.reject(this.downError(code, handle.remote))
  }

  private downError(code: BridgeErrorCode, service?: string): BridgeError {
    switch (code) {
      case 'ESERVICEDOWN':
        return new BridgeError(code, `service "${service}" went down`)
      case 'EDISPOSED':
        return new BridgeError(code, `bridge "${this.name}" was disposed`)
      default:
        return new BridgeError(code, `bridge "${this.name}" is disconnected`)
    }
  }

  private createProxy(handle: ProxyHandle, methods: string[]): object {
    const proxy: Record<string, unknown> = {}
    for (const method of methods) {
      const call = (...args: unknown[]) => this.call(handle, method, args)
      Object.defineProperty(proxy, method, { value: named(call, method), enumerable: true, writable: true, configurable: true })
    }
    const marker: RemoteMarker = { bridge: this.name, name: handle.remote }
    Object.defineProperty(proxy, REMOTE_MARKER, { value: marker })
    return proxy
  }

  private call(handle: ProxyHandle, method: string, args: unknown[]): Promise<unknown> {
    if (handle.state === 'closed' || !this.peer) {
      return Promise.reject(this.downError(handle.code ?? 'EDISCONNECTED', handle.remote))
    }
    return new Promise((resolve, reject) => {
      const id = ++this.callSeq
      const pending: PendingCall = { handle, resolve, reject }
      // Registered before sending: an in-memory transport may answer synchronously.
      this.calls.set(id, pending)
      handle.calls.add(id)
      try {
        this.post({ t: 'call', id, name: handle.remote, method, args })
      } catch (error) {
        this.settle(id)
        reject(
          error instanceof BridgeError
            ? error
            : isCloneError(error)
              ? new BridgeError('EDATACLONE', `arguments of ${handle.remote}.${method} cannot be cloned: ${messageOf(error)}`, { cause: error })
              : new BridgeError('EDISCONNECTED', `cannot send ${handle.remote}.${method}: ${messageOf(error)}`, { cause: error }),
        )
        return
      }
      const ms = this.timeouts[`${handle.remote}.${method}`] ?? this.timeouts[`${handle.local}.${method}`] ?? this.timeout
      if (ms > 0 && this.calls.get(id) === pending) {
        pending.timer = setTimeout(() => {
          this.settle(id)
          reject(new BridgeError('ETIMEOUT', `${handle.remote}.${method} timed out after ${ms}ms`))
        }, ms)
      }
    })
  }

  private settle(id: number): PendingCall | undefined {
    const pending = this.calls.get(id)
    if (!pending) return
    this.calls.delete(id)
    pending.handle.calls.delete(id)
    clearTimeout(pending.timer)
    return pending
  }

  private onResult(message: ResultMessage) {
    const pending = this.settle(message.id)
    if (!pending) {
      this.logger.debug(`ignoring result of unknown call ${message.id}`)
      return
    }
    if (message.ok) pending.resolve(message.value)
    else pending.reject(deserializeError(message.error as SerializedError))
  }

  // ---- events -----------------------------------------------------------------------------

  private forwardEvent(name: string, args: unknown[]) {
    // Skip what we are re-emitting ourselves, otherwise two bridges forwarding+accepting the same
    // event would bounce it forever.
    if (!this.peer || this.closed || this.reemitting === name) return
    try {
      this.post({ t: 'event', name, args })
    } catch (error) {
      this.logger.warn(`cannot forward "${name}": ${messageOf(error)}`)
    }
  }

  private onEvent(message: EventMessage) {
    if (!this.accept.has(message.name)) {
      this.logger.debug(`dropping event "${message.name}": not accepted`)
      return
    }
    const outer = this.reemitting
    this.reemitting = message.name
    try {
      this.events.emit(message.name, ...message.args)
    } catch (error) {
      this.logger.error(error)
    } finally {
      this.reemitting = outer
    }
  }
}
