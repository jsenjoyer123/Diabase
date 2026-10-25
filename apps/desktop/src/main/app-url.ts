import { pathToFileURL } from 'node:url'

// The only documents the app ever loads: the electron-vite dev server (dev only) or the
// built renderer on disk. Everything else (navigation, window.open, IPC senders) is refused.
export type AppTarget =
  | { kind: 'dev'; url: string }
  | { kind: 'file'; url: string; path: string }

const LOOPBACK_HOSTS = new Set(['localhost', '127.0.0.1', '[::1]'])

/** ELECTRON_RENDERER_URL is honoured only when unpackaged and only for loopback http(s). */
export function resolveDevServerUrl(raw: string | undefined, isPackaged: boolean): string | undefined {
  if (isPackaged || !raw) return undefined
  let url: URL
  try {
    url = new URL(raw)
  } catch {
    return undefined
  }
  if (url.protocol !== 'http:' && url.protocol !== 'https:') return undefined
  return LOOPBACK_HOSTS.has(url.hostname) ? url.href : undefined
}

export function resolveAppTarget(options: {
  devServerUrl: string | undefined
  rendererIndex: string
}): AppTarget {
  if (options.devServerUrl) return { kind: 'dev', url: options.devServerUrl }
  return { kind: 'file', url: pathToFileURL(options.rendererIndex).href, path: options.rendererIndex }
}

export function isAppUrl(candidate: string, target: AppTarget): boolean {
  let url: URL
  try {
    url = new URL(candidate)
  } catch {
    return false
  }
  const expected = new URL(target.url)
  if (target.kind === 'dev') return url.origin === expected.origin
  return url.protocol === 'file:' && url.pathname === expected.pathname
}
