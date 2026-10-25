/**
 * The renderer-side view of a service that lives in another context: every method becomes
 * async, and non-method members (state, getters, `ctx`) do not cross the bridge.
 */
export type Remote<T> = {
  [K in keyof T as NonNullable<T[K]> extends (...args: any) => any ? K : never]: NonNullable<T[K]> extends (
    ...args: infer A
  ) => infer R
    ? (...args: A) => Promise<Awaited<R>>
    : never
}

/**
 * Non-enumerable marker on every proxy object the bridge provides. The inspector reads it via
 * `Symbol.for('diabase.bridge.remote')`, so the key must not change.
 */
export const REMOTE_MARKER: unique symbol = Symbol.for('diabase.bridge.remote')

export interface RemoteMarker {
  /** `name` of the bridge that provides the proxy. */
  bridge: string
  /** The service's name on the exposing side (differs from the local name for aliased imports). */
  name: string
}
