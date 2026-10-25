import { describe, expect, it } from 'vitest'
import { BridgeError, deserializeError, serializeError } from '@diabase/kernel'
import { VaultError } from './helpers/services.ts'

/** What actually happens on the wire: serialize, structured-clone, deserialize. */
function roundTrip(error: unknown) {
  return deserializeError(structuredClone(serializeError(error)))
}

describe('error serialization', () => {
  it('keeps name, code, message and custom props of a VaultError', () => {
    const error = roundTrip(new VaultError('ENOENT', 'a/b.md', 'no such file: a/b.md'))
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('VaultError')
    expect(error.message).toBe('no such file: a/b.md')
    expect(error).toMatchObject({ code: 'ENOENT', path: 'a/b.md' })
  })

  it('serializes to plain, cloneable data', () => {
    const data = serializeError(new VaultError('EEXIST', 'x', 'exists'))
    expect(data).toMatchObject({ name: 'VaultError', code: 'EEXIST', path: 'x', message: 'exists' })
    expect(typeof data.stack).toBe('string')
    expect(() => structuredClone(data)).not.toThrow()
  })

  it('rehydrates native error names as that class', () => {
    for (const ctor of [TypeError, RangeError, SyntaxError, ReferenceError, EvalError, URIError]) {
      const error = roundTrip(new ctor('boom'))
      expect(error).toBeInstanceOf(ctor)
      expect(error.name).toBe(ctor.name)
      expect(error.message).toBe('boom')
    }
  })

  it('turns thrown non-errors into Errors', () => {
    expect(roundTrip('plain string')).toMatchObject({ name: 'Error', message: 'plain string' })
    expect(roundTrip(42)).toMatchObject({ name: 'Error', message: '42' })
    expect(roundTrip(undefined)).toMatchObject({ name: 'Error', message: 'undefined' })
    expect(roundTrip(null)).toMatchObject({ name: 'Error', message: 'null' })
    const error = roundTrip({ name: 'Custom', message: 'from a plain object', code: 'E1' })
    expect(error).toBeInstanceOf(Error)
    expect(error).toMatchObject({ name: 'Custom', message: 'from a plain object', code: 'E1' })
  })

  it('drops own props that are not structured-clone safe, keeps the rest', () => {
    const error = Object.assign(new Error('x'), { fn: () => 1, ok: { n: 1 }, bytes: new Uint8Array([1, 2]), sym: Symbol('s') })
    const data = serializeError(error)
    expect(data).not.toHaveProperty('fn')
    expect(data).not.toHaveProperty('sym')
    expect(() => structuredClone(data)).not.toThrow()
    expect(roundTrip(error)).toMatchObject({ ok: { n: 1 }, bytes: new Uint8Array([1, 2]) })
  })

  it('serializes nested causes', () => {
    const error = roundTrip(new Error('outer', { cause: new RangeError('inner', { cause: 'root' }) }))
    expect(error.cause).toBeInstanceOf(RangeError)
    expect((error.cause as Error).message).toBe('inner')
    expect(((error.cause as Error).cause as Error).message).toBe('root')
  })

  it('survives cyclic causes and hostile getters', () => {
    const cyclic = new Error('loop')
    cyclic.cause = cyclic
    expect(() => serializeError(cyclic)).not.toThrow()
    const hostile = { get message(): string { throw new Error('nope') } }
    expect(serializeError(hostile)).toMatchObject({ name: 'Error' })
  })

  it('keeps BridgeError as BridgeError with its code', () => {
    const error = roundTrip(new BridgeError('ENOMETHOD', 'no such method'))
    expect(error).toBeInstanceOf(BridgeError)
    expect(error).toMatchObject({ name: 'BridgeError', code: 'ENOMETHOD', message: 'no such method' })
  })

  it('does not trust a BridgeError name with an unknown code', () => {
    const error = deserializeError({ name: 'BridgeError', message: 'm', code: 'EWHATEVER' })
    expect(error).not.toBeInstanceOf(BridgeError)
    expect(error).toMatchObject({ name: 'BridgeError', code: 'EWHATEVER' })
  })

  it('cannot be tricked into prototype pollution', () => {
    const data = JSON.parse('{"name":"Error","message":"m","__proto__":{"polluted":true},"constructor":"x"}')
    const error = deserializeError(data)
    expect((error as any).polluted).toBeUndefined()
    expect(({} as any).polluted).toBeUndefined()
  })

  it('tolerates garbage input', () => {
    expect(deserializeError(undefined as never)).toBeInstanceOf(Error)
    expect(deserializeError({} as never).message).toBe('')
    expect(deserializeError({ name: 5, message: {} } as never)).toBeInstanceOf(Error)
  })

  it('exposes BridgeError fields', () => {
    const error = new BridgeError('ETIMEOUT', 'slow', { cause: 'c' })
    expect(error).toBeInstanceOf(Error)
    expect(error.name).toBe('BridgeError')
    expect(error.code).toBe('ETIMEOUT')
    expect(error.cause).toBe('c')
  })
})
