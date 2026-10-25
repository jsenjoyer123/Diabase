export type CspMode = 'production' | 'development'

const PRODUCTION: Record<string, string[]> = {
  'default-src': ["'self'"],
  // blob: lets the hot loader deliver bundles as classic <script src="blob:...">
  // without 'unsafe-eval' (architecture.md §6)
  'script-src': ["'self'", 'blob:'],
  'style-src': ["'self'", "'unsafe-inline'"],
  'img-src': ["'self'", 'data:', 'blob:'],
  'font-src': ["'self'"],
  'connect-src': ["'self'"],
  'object-src': ["'none'"],
  'base-uri': ["'none'"],
  'form-action': ["'none'"],
  // Chromium ignores this one in a <meta> policy (logs a console warning); kept as documented intent.
  'frame-ancestors': ["'none'"],
}

// The Vite dev server needs an inline React Refresh preamble and an HMR websocket.
// Loopback only; the production policy never gets any of this.
const DEVELOPMENT_EXTRA: Record<string, string[]> = {
  'script-src': ["'unsafe-inline'"],
  'connect-src': ['ws://localhost:*', 'ws://127.0.0.1:*', 'http://localhost:*', 'http://127.0.0.1:*'],
}

export function buildCsp(mode: CspMode): string {
  const policy = new Map(Object.entries(PRODUCTION).map(([name, sources]) => [name, [...sources]]))
  if (mode === 'development') {
    for (const [name, extra] of Object.entries(DEVELOPMENT_EXTRA)) {
      policy.get(name)!.push(...extra)
    }
  }
  return [...policy].map(([name, sources]) => `${name} ${sources.join(' ')}`).join('; ')
}
