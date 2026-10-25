export type BridgeErrorCode =
  | 'EDISCONNECTED'
  | 'ESERVICEDOWN'
  | 'ENOSERVICE'
  | 'ENOMETHOD'
  | 'ETIMEOUT'
  | 'EDATACLONE'
  | 'EDISPOSED'
  | 'EPROTOCOL'

const CODES: ReadonlySet<string> = new Set<BridgeErrorCode>([
  'EDISCONNECTED',
  'ESERVICEDOWN',
  'ENOSERVICE',
  'ENOMETHOD',
  'ETIMEOUT',
  'EDATACLONE',
  'EDISPOSED',
  'EPROTOCOL',
])

export class BridgeError extends Error {
  override name = 'BridgeError'
  code: BridgeErrorCode

  constructor(code: BridgeErrorCode, message: string, options?: ErrorOptions) {
    super(message, options)
    this.code = code
  }
}

/** Plain-data shape of an error that crosses the bridge (structured-clone safe). */
export interface SerializedError {
  name: string
  message: string
  code?: string
  stack?: string
  cause?: SerializedError
  [key: string]: unknown
}

const NATIVE_ERRORS: Record<string, ErrorConstructor> = {
  Error,
  EvalError,
  RangeError,
  ReferenceError,
  SyntaxError,
  TypeError,
  URIError,
}

const RESERVED = new Set(['name', 'message', 'stack', 'cause', '__proto__'])
const MAX_CAUSE_DEPTH = 8

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}

function isCloneable(value: unknown): boolean {
  try {
    structuredClone(value)
    return true
  } catch {
    return false
  }
}

function describe(value: unknown): string {
  try {
    return String(value)
  } catch {
    return '[unprintable value]'
  }
}

function serialize(error: unknown, depth: number): SerializedError {
  if (!isRecord(error) && typeof error !== 'function') {
    return { name: 'Error', message: describe(error) }
  }
  const source = error as Record<string, unknown>
  const result: SerializedError = {
    name: typeof source.name === 'string' && source.name ? source.name : 'Error',
    message: typeof source.message === 'string' ? source.message : describe(error),
  }
  if (typeof source.stack === 'string') result.stack = source.stack
  for (const key of Object.keys(source)) {
    if (RESERVED.has(key)) continue
    const value = source[key]
    if (isCloneable(value)) result[key] = value
  }
  if (source.cause !== undefined && depth < MAX_CAUSE_DEPTH) {
    result.cause = serialize(source.cause, depth + 1)
  }
  return result
}

/**
 * Converts anything thrown into plain data. Own enumerable props survive only when they are
 * structured-clone safe; non-error throwables (strings, ...) become `{ name: 'Error', message }`.
 */
export function serializeError(error: unknown): SerializedError {
  try {
    return serialize(error, 0)
  } catch {
    return { name: 'Error', message: 'unserializable error' }
  }
}

function define(target: object, key: string, value: unknown, enumerable: boolean) {
  Object.defineProperty(target, key, { value, enumerable, writable: true, configurable: true })
}

/**
 * Inverse of `serializeError`. Native error names (`TypeError`, ...) and `BridgeError` come back as
 * that class; any other name (e.g. `VaultError`) yields an `Error` carrying the same name and props.
 */
export function deserializeError(data: SerializedError): Error {
  const record: Record<string, unknown> = isRecord(data) ? data : {}
  const name = typeof record.name === 'string' && record.name ? record.name : 'Error'
  const message = typeof record.message === 'string' ? record.message : ''
  const options: ErrorOptions | undefined = isRecord(record.cause)
    ? { cause: deserializeError(record.cause as SerializedError) }
    : undefined

  let error: Error
  if (name === 'BridgeError' && typeof record.code === 'string' && CODES.has(record.code)) {
    error = new BridgeError(record.code as BridgeErrorCode, message, options)
  } else {
    error = new (NATIVE_ERRORS[name] ?? Error)(message, options)
    if (error.name !== name) define(error, 'name', name, false)
  }
  if (typeof record.stack === 'string') define(error, 'stack', record.stack, false)
  for (const key of Object.keys(record)) {
    if (RESERVED.has(key) || (error instanceof BridgeError && key === 'code')) continue
    define(error, key, record[key], true)
  }
  return error
}

/** Whether `error` (thrown by `postMessage` or `structuredClone`) means the payload cannot be cloned. */
export function isCloneError(error: unknown): boolean {
  if (!isRecord(error)) return false
  return error.name === 'DataCloneError' || /could not be cloned|DataCloneError/i.test(String(error.message))
}
