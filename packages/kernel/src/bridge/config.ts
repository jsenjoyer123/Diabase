import { z } from 'zod'
import type { BridgeTransport } from './transport.ts'

export type BridgeGuard = (method: string, args: unknown[]) => void | Promise<void>

export interface ExposeOptions {
  name: string
  /** Explicit method list; defaults to every function on the service and its prototype chain. */
  methods?: string[]
  /** Runs before every call; a throw or rejection becomes the call's error. */
  guard?: BridgeGuard
}

export interface ImportOptions {
  /** The service's name on the exposing side. */
  name: string
  /** The name it is provided under locally. */
  as: string
}

export interface BridgeConfig {
  transport: BridgeTransport
  /** Label used in logs, status events, and the remote marker (default 'bridge'). */
  name?: string
  /** Local services served to the peer. A string auto-discovers the methods. */
  expose?: Array<string | ExposeOptions>
  /** Peer services provided locally as proxies. A string keeps the same name. */
  import?: Array<string | ImportOptions>
  /** Local event names forwarded to the peer. */
  forward?: string[]
  /** Peer event names accepted and emitted on the local context; everything else is dropped. */
  accept?: string[]
  /** Per-call timeout in ms (default 30_000; 0 = none). */
  timeout?: number
  /** Overrides keyed `service.method` (the exposing side's service name); `0` = no timeout. */
  timeouts?: Record<string, number>
  /**
   * How long the exposing side waits for the peer to release a withdrawn service (default
   * 10_000). `0` announces the withdrawal but does not wait.
   */
  releaseTimeout?: number
  /** Close the transport when the bridge is disposed (default false). */
  ownsTransport?: boolean
}

export interface BridgeStatus {
  name: string
  connected: boolean
  /** Imports in config order; `up` = the proxy is provided locally and callable. */
  remote: Array<{ name: string; local: string; up: boolean }>
  /** Local services currently announced to the peer; empty while disconnected. */
  exposed: string[]
}

const name = z.string().min(1)

export const BridgeConfigSchema: z.ZodType<BridgeConfig> = z.strictObject({
  transport: z.custom<BridgeTransport>(
    (value) =>
      typeof value === 'object' &&
      value !== null &&
      typeof (value as BridgeTransport).send === 'function' &&
      typeof (value as BridgeTransport).onMessage === 'function',
    'expected a BridgeTransport ({ send, onMessage })',
  ),
  name: name.optional(),
  expose: z
    .array(
      z.union([
        name,
        z.strictObject({
          name,
          methods: z.array(name).optional(),
          guard: z.custom<BridgeGuard>((value) => typeof value === 'function', 'expected a function').optional(),
        }),
      ]),
    )
    .optional(),
  import: z.array(z.union([name, z.strictObject({ name, as: name })])).optional(),
  forward: z.array(name).optional(),
  accept: z.array(name).optional(),
  timeout: z.number().min(0).optional(),
  timeouts: z.record(z.string(), z.number().min(0)).optional(),
  releaseTimeout: z.number().min(0).optional(),
  ownsTransport: z.boolean().optional(),
})
