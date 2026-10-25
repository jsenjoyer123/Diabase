import { Context, Service } from 'cordis'
import type { EffectMeta, Fiber } from 'cordis'

/** Cordis fiber lifecycle state rendered as a stable, serializable string. */
export type InspectorFiberState = 'pending' | 'loading' | 'active' | 'failed' | 'disposed' | 'unloading'

export interface InspectorEffect {
  label: string
  children: InspectorEffect[]
}

export interface InspectorFiber {
  /** Stable Cordis fiber id; `0` identifies the root context. */
  uid: number
  name: string
  state: InspectorFiberState
  /** Required Cordis injections and whether each currently resolves. */
  injects: Array<{ name: string; available: boolean }>
  missingInjects: string[]
  services: string[]
  effects: InspectorEffect[]
  children: InspectorFiber[]
}

export interface InspectorServiceEntry {
  name: string
  provider: { uid: number; name: string }
}

export interface InspectorEventEntry {
  name: string
  listeners: number
  fibers: number[]
}

/** Structured-clone-safe point-in-time view of the Cordis context. */
export interface InspectorSnapshot {
  root: InspectorFiber
  services: InspectorServiceEntry[]
  events: InspectorEventEntry[]
}

export interface InspectorService {
  snapshot(): InspectorSnapshot
}

const STATE_NAMES: Record<number, InspectorFiberState> = {
  0: 'pending',
  1: 'loading',
  2: 'active',
  3: 'failed',
  4: 'disposed',
  5: 'unloading',
}

const DISPOSED_HISTORY_LIMIT = 100

interface SeenFiber {
  fiber: Fiber
  parentUid: number
}

/**
 * Cordis 4 inspector built only from its public registry, Fiber and Reflect APIs.
 * In particular, it does not subscribe to Cordis internal events or read the
 * `committed` implementation detail.
 */
export class Inspector extends Service<InspectorService> implements InspectorService {
  private readonly root: Context
  private readonly fiberIds = new WeakMap<Fiber, number>()
  private readonly seen = new Map<number, SeenFiber>()
  private readonly disposed = new Map<number, InspectorFiber>()
  private readonly disposedParents = new Map<number, number>()

  constructor(ctx: Context) {
    super(ctx, 'inspector')
    this.root = ctx[Context.root]
  }

  snapshot(): InspectorSnapshot {
    const fibers = this.collectFibers()
    const currentIds = new Set<number>()

    for (const fiber of fibers) {
      const uid = this.uidOf(fiber)
      currentIds.add(uid)
      this.seen.set(uid, {
        fiber,
        parentUid: this.uidOf(fiber.parent.fiber),
      })
      this.disposed.delete(uid)
    }

    for (const [uid, previous] of this.seen) {
      if (currentIds.has(uid) || previous.fiber.state !== 4) continue
      this.disposed.set(uid, this.serializeFiber(previous.fiber, uid, []))
      this.disposedParents.set(uid, previous.parentUid)
      this.seen.delete(uid)
    }
    while (this.disposed.size > DISPOSED_HISTORY_LIMIT) {
      const oldest = this.disposed.keys().next().value
      if (oldest === undefined) break
      this.disposed.delete(oldest)
      this.disposedParents.delete(oldest)
    }

    const serialized = new Map<number, InspectorFiber>()
    const parentUids = new Map<number, number>()
    for (const fiber of fibers) {
      const uid = this.uidOf(fiber)
      serialized.set(uid, this.serializeFiber(fiber, uid, this.effectsOf(fiber)))
      parentUids.set(uid, this.uidOf(fiber.parent.fiber))
    }
    for (const [uid, snapshot] of this.disposed) {
      serialized.set(uid, snapshot)
      const parentUid = this.disposedParents.get(uid)
      if (parentUid !== undefined) parentUids.set(uid, parentUid)
    }

    const rootFiber = this.root.fiber
    const rootUid = this.uidOf(rootFiber)
    const root = this.serializeFiber(rootFiber, rootUid, this.effectsOf(rootFiber))
    serialized.set(rootUid, root)

    for (const [uid, child] of serialized) {
      if (uid === rootUid) continue
      const parentUid = parentUids.get(uid)
      const parent = parentUid === undefined ? undefined : serialized.get(parentUid)
      ;(parent ?? root).children.push(child)
    }

    const services: InspectorServiceEntry[] = []
    const events = new Map<string, InspectorEventEntry>()
    for (const fiber of fibers) {
      const uid = this.uidOf(fiber)
      for (const service of fiber.provisions) {
        services.push({ name: service.name, provider: { uid, name: fiber.name } })
      }
      this.collectEvents(this.effectsOf(fiber), uid, events)
    }

    return {
      root,
      services: services.sort((a, b) => a.name.localeCompare(b.name)),
      events: [...events.values()].sort((a, b) => a.name.localeCompare(b.name)),
    }
  }

  private collectFibers(): Fiber[] {
    const result = new Map<number, Fiber>()
    for (const runtime of this.root.registry.values()) {
      for (const fiber of runtime.fibers) {
        result.set(this.uidOf(fiber), fiber)
      }
    }
    return [...result.values()]
  }

  private uidOf(fiber: Fiber): number {
    if (fiber.uid !== null) {
      this.fiberIds.set(fiber, fiber.uid)
      return fiber.uid
    }
    if (fiber === this.root.fiber) return 0
    return this.fiberIds.get(fiber) ?? 0
  }

  private serializeFiber(fiber: Fiber, uid: number, effects: InspectorEffect[]): InspectorFiber {
    const injects = Object.keys(fiber.inject).map((name) => ({
      name,
      available: fiber.ctx.get(name, false) !== undefined,
    }))
    return {
      uid,
      name: fiber.name,
      state: STATE_NAMES[fiber.state] ?? 'failed',
      injects,
      missingInjects: injects.filter((inject) => !inject.available).map((inject) => inject.name),
      services: [...fiber.provisions].map((service) => service.name).sort(),
      effects,
      children: [],
    }
  }

  private effectsOf(fiber: Fiber): InspectorEffect[] {
    return this.serializeEffectChildren(fiber.getEffects())
  }

  private serializeEffectChildren(children: EffectMeta[]): InspectorEffect[] {
    return children.map((child) => ({
      label: child.label,
      children: this.serializeEffectChildren(child.children),
    }))
  }

  private collectEvents(
    effects: InspectorEffect[],
    uid: number,
    events: Map<string, InspectorEventEntry>,
  ): void {
    for (const effect of effects) {
      const match = /^ctx\.on\((.*)\)$/.exec(effect.label)
      if (match) {
        const encodedName = match[1] ?? ''
        let name = encodedName
        try {
          const parsed: unknown = JSON.parse(encodedName)
          if (typeof parsed === 'string') name = parsed
        } catch {
          // Cordis stringifies symbol event names directly in effect labels.
        }
        const event: InspectorEventEntry = events.get(name) ?? { name, listeners: 0, fibers: [] }
        event.listeners++
        if (!event.fibers.includes(uid)) event.fibers.push(uid)
        events.set(name, event)
      }
      this.collectEvents(effect.children, uid, events)
    }
  }

}

export function inspector(ctx: Context): void {
  ctx.plugin(Inspector)
}
