import { Context, Service } from '@diabase/kernel'

export class VaultError extends Error {
  override name = 'VaultError'
  code: string
  path: string
  constructor(code: string, path: string, message: string) {
    super(message)
    this.code = code
    this.path = path
  }
}

export interface Deferred<T = void> {
  promise: Promise<T>
  resolve(value: T): void
  reject(error: unknown): void
}

export function deferred<T = void>(): Deferred<T> {
  let resolve!: (value: T) => void
  let reject!: (error: unknown) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}

class Base extends Service {
  /** Inherited method: discovery must walk the prototype chain. */
  inherited() {
    return 'inherited'
  }
}

/** A vault-like main-side service covering every method style the bridge has to expose. */
export class Vault extends Base {
  calls: string[] = []
  gate?: Deferred
  started = deferred()

  constructor(ctx: Context) {
    super(ctx, 'vault')
  }

  // prototype methods
  async info() {
    return { id: 'v', name: 'fake' }
  }
  add(a: number, b: number) {
    return a + b // sync
  }
  async echo<T>(value: T): Promise<T> {
    return value
  }
  async read(path: string): Promise<never> {
    throw new VaultError('ENOENT', path, `no such file: ${path}`)
  }
  async typeError() {
    return (undefined as any).x as never
  }
  async throwString(): Promise<never> {
    throw 'plain string'
  }
  async throwWithCause(): Promise<never> {
    throw new Error('outer', { cause: new RangeError('inner') })
  }
  async returnFunction() {
    return () => 1
  }
  /** Blocks until `gate` is resolved, signalling `started` first. */
  async hang(): Promise<string> {
    this.started.resolve()
    await (this.gate ??= deferred()).promise
    return 'done'
  }
  async never(): Promise<void> {
    this.started.resolve()
    return new Promise<void>(() => {})
  }

  // arrow-function property
  stat = async (path: string) => ({ path, size: 3 })

  // must not be exposed
  _private() {
    return 'private'
  }
  get accessor(): string {
    throw new Error('accessors must never be invoked by discovery')
  }
}

export class Slots extends Service {
  constructor(ctx: Context) {
    super(ctx, 'slots')
  }
  async getCatalog() {
    return ['editor', 'files']
  }
}
