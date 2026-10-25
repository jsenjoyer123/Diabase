import { describe, expect, it } from 'vitest'
import { buildCsp } from '../src/shared/csp.ts'

const directive = (csp: string, name: string) =>
  csp
    .split('; ')
    .find((part) => part.startsWith(`${name} `))
    ?.split(' ')
    .slice(1)

describe('buildCsp', () => {
  it('production matches the architecture policy exactly', () => {
    expect(buildCsp('production')).toBe(
      "default-src 'self'; script-src 'self' blob:; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; " +
        "font-src 'self'; connect-src 'self'; object-src 'none'; base-uri 'none'; form-action 'none'; frame-ancestors 'none'",
    )
  })

  it('production never allows eval or inline scripts', () => {
    const scripts = directive(buildCsp('production'), 'script-src')
    expect(scripts).toEqual(["'self'", 'blob:'])
    expect(buildCsp('production')).not.toContain('unsafe-eval')
    expect(buildCsp('production')).not.toContain('http:')
    expect(buildCsp('production')).not.toContain('ws:')
  })

  it('development adds only the dev-server needs, on loopback', () => {
    const csp = buildCsp('development')
    expect(directive(csp, 'script-src')).toEqual(["'self'", 'blob:', "'unsafe-inline'"])
    expect(directive(csp, 'connect-src')).toEqual([
      "'self'",
      'ws://localhost:*',
      'ws://127.0.0.1:*',
      'http://localhost:*',
      'http://127.0.0.1:*',
    ])
    expect(csp).not.toContain('unsafe-eval')
    expect(directive(csp, 'object-src')).toEqual(["'none'"])
  })

  it('does not leak dev sources into later production builds', () => {
    buildCsp('development')
    expect(directive(buildCsp('production'), 'script-src')).toEqual(["'self'", 'blob:'])
  })
})
