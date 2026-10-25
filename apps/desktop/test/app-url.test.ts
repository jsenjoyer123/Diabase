import { describe, expect, it } from 'vitest'
import { isAppUrl, resolveAppTarget, resolveDevServerUrl } from '../src/main/app-url.ts'

describe('resolveDevServerUrl', () => {
  it('accepts loopback http(s) in dev', () => {
    expect(resolveDevServerUrl('http://localhost:5173', false)).toBe('http://localhost:5173/')
    expect(resolveDevServerUrl('http://127.0.0.1:5173/', false)).toBe('http://127.0.0.1:5173/')
    expect(resolveDevServerUrl('http://[::1]:5173', false)).toBe('http://[::1]:5173/')
  })

  it('ignores the variable when packaged', () => {
    expect(resolveDevServerUrl('http://localhost:5173', true)).toBeUndefined()
  })

  it('refuses remote, non-http and malformed values', () => {
    expect(resolveDevServerUrl('https://evil.example', false)).toBeUndefined()
    expect(resolveDevServerUrl('http://localhost.evil.example', false)).toBeUndefined()
    expect(resolveDevServerUrl('file:///etc/passwd', false)).toBeUndefined()
    expect(resolveDevServerUrl('not a url', false)).toBeUndefined()
    expect(resolveDevServerUrl('', false)).toBeUndefined()
    expect(resolveDevServerUrl(undefined, false)).toBeUndefined()
  })
})

describe('isAppUrl', () => {
  const dev = resolveAppTarget({ devServerUrl: 'http://localhost:5173/', rendererIndex: '/app/out/renderer/index.html' })
  const file = resolveAppTarget({ devServerUrl: undefined, rendererIndex: '/app/out/renderer/index.html' })

  it('prefers the dev server when given', () => {
    expect(dev.kind).toBe('dev')
    expect(file).toEqual({ kind: 'file', url: 'file:///app/out/renderer/index.html', path: '/app/out/renderer/index.html' })
  })

  it('dev: same origin only', () => {
    expect(isAppUrl('http://localhost:5173/', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5173/index.html?x=1#y', dev)).toBe(true)
    expect(isAppUrl('http://localhost:5174/', dev)).toBe(false)
    expect(isAppUrl('http://127.0.0.1:5173/', dev)).toBe(false)
    expect(isAppUrl('https://localhost:5173/', dev)).toBe(false)
    expect(isAppUrl('file:///app/out/renderer/index.html', dev)).toBe(false)
  })

  it('file: only the built index.html, ignoring query and hash', () => {
    expect(isAppUrl('file:///app/out/renderer/index.html', file)).toBe(true)
    expect(isAppUrl('file:///app/out/renderer/index.html#/x?y=1', file)).toBe(true)
    expect(isAppUrl('file:///app/out/renderer/other.html', file)).toBe(false)
    expect(isAppUrl('file:///etc/passwd', file)).toBe(false)
    expect(isAppUrl('http://localhost:5173/', file)).toBe(false)
    expect(isAppUrl('https://example.com/app/out/renderer/index.html', file)).toBe(false)
  })

  it('rejects garbage', () => {
    expect(isAppUrl('', file)).toBe(false)
    expect(isAppUrl('about:blank', file)).toBe(false)
    expect(isAppUrl('not a url', dev)).toBe(false)
  })
})
