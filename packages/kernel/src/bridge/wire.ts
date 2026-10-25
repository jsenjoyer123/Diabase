import type { SerializedError } from './errors.ts'

/** Bumped on any incompatible change to the messages below. */
export const PROTOCOL_VERSION = 1

/** Sent by both sides on start; `ack` answers a fresh hello and never triggers a reply. */
export interface HelloMessage {
  t: 'hello'
  /** Sender's session id. */
  s: string
  v: number
  ack: boolean
  name: string
}

export interface ByeMessage {
  t: 'bye'
  s: string
}

/** Everything after the handshake carries the sender (`s`) and the intended receiver (`r`) session. */
export interface Envelope {
  s: string
  r: string
}

export interface UpMessage extends Envelope {
  t: 'up'
  name: string
  /** Identifies one activation of the service so a late `released` cannot be mistaken for a newer one. */
  gen: number
  methods: string[]
}

export interface DownMessage extends Envelope {
  t: 'down'
  name: string
  gen: number
}

export interface ReleasedMessage extends Envelope {
  t: 'released'
  name: string
  gen: number
}

export interface CallMessage extends Envelope {
  t: 'call'
  id: number
  name: string
  method: string
  args: unknown[]
}

export interface ResultMessage extends Envelope {
  t: 'result'
  id: number
  ok: boolean
  value?: unknown
  error?: SerializedError
}

export interface EventMessage extends Envelope {
  t: 'event'
  name: string
  args: unknown[]
}

export type AddressedMessage =
  | UpMessage
  | DownMessage
  | ReleasedMessage
  | CallMessage
  | ResultMessage
  | EventMessage

export type WireMessage = HelloMessage | ByeMessage | AddressedMessage

/** An addressed message before the sender fills in the envelope. */
export type Body<T extends AddressedMessage = AddressedMessage> = T extends AddressedMessage ? Omit<T, keyof Envelope> : never

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isId(value: unknown): value is string {
  return typeof value === 'string' && value.length > 0
}

function isCount(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0
}

function isStrings(value: unknown): value is string[] {
  return Array.isArray(value) && value.every((item) => typeof item === 'string')
}

/** Validates an untrusted incoming message; returns a fresh typed copy, or undefined when malformed. */
export function parseWireMessage(raw: unknown): WireMessage | undefined {
  if (!isRecord(raw) || !isId(raw.s)) return
  const s = raw.s
  if (raw.t === 'hello') {
    if (typeof raw.v !== 'number' || typeof raw.ack !== 'boolean' || typeof raw.name !== 'string') return
    return { t: 'hello', s, v: raw.v, ack: raw.ack, name: raw.name }
  }
  if (raw.t === 'bye') return { t: 'bye', s }
  if (!isId(raw.r)) return
  const r = raw.r
  switch (raw.t) {
    case 'up':
      if (typeof raw.name !== 'string' || !isCount(raw.gen) || !isStrings(raw.methods)) return
      return { t: 'up', s, r, name: raw.name, gen: raw.gen, methods: raw.methods }
    case 'down':
    case 'released':
      if (typeof raw.name !== 'string' || !isCount(raw.gen)) return
      return { t: raw.t, s, r, name: raw.name, gen: raw.gen }
    case 'call':
      if (!isCount(raw.id) || typeof raw.name !== 'string' || typeof raw.method !== 'string') return
      if (!Array.isArray(raw.args)) return
      return { t: 'call', s, r, id: raw.id, name: raw.name, method: raw.method, args: raw.args }
    case 'result':
      if (!isCount(raw.id)) return
      if (raw.ok === true) return { t: 'result', s, r, id: raw.id, ok: true, value: raw.value }
      if (raw.ok === false && isRecord(raw.error)) {
        return { t: 'result', s, r, id: raw.id, ok: false, error: raw.error as SerializedError }
      }
      return { t: 'result', s, r, id: raw.id, ok: false, error: MALFORMED_RESULT }
    case 'event':
      if (typeof raw.name !== 'string' || !Array.isArray(raw.args)) return
      return { t: 'event', s, r, name: raw.name, args: raw.args }
  }
}

const MALFORMED_RESULT: SerializedError = {
  name: 'BridgeError',
  code: 'EPROTOCOL',
  message: 'malformed result message',
}
