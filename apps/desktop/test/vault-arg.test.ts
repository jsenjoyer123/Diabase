import { describe, expect, it } from 'vitest'
import { parseVaultArg } from '../src/main/vault-arg.ts'

describe('parseVaultArg', () => {
  it('reads `--vault <path>`', () => {
    expect(parseVaultArg(['electron', '.', '--vault', '/tmp/v'])).toBe('/tmp/v')
  })

  it('reads `--vault=<path>`', () => {
    expect(parseVaultArg(['app', '--vault=/tmp/v w/ space'])).toBe('/tmp/v w/ space')
  })

  it('returns undefined when absent', () => {
    expect(parseVaultArg(['electron', '.'])).toBeUndefined()
    expect(parseVaultArg([])).toBeUndefined()
  })

  it('ignores a flag without a value', () => {
    expect(parseVaultArg(['app', '--vault'])).toBeUndefined()
    expect(parseVaultArg(['app', '--vault', '--other'])).toBeUndefined()
    expect(parseVaultArg(['app', '--vault='])).toBeUndefined()
  })

  it('lets the last occurrence win', () => {
    expect(parseVaultArg(['app', '--vault', '/a', '--vault=/b'])).toBe('/b')
  })

  it('does not look past `--`', () => {
    expect(parseVaultArg(['app', '--', '--vault', '/a'])).toBeUndefined()
  })

  it('does not mistake look-alike flags for the vault flag', () => {
    expect(parseVaultArg(['app', '--vaults', '/a', '--vault-root=/b', '-vault', '/c'])).toBeUndefined()
  })
})
