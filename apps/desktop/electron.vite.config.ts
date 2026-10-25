import { readFileSync } from 'node:fs'
import { defineConfig } from 'electron-vite'
import type { Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import { buildCsp } from './src/shared/csp.ts'

// Workspace packages (@diabase/*) ship TypeScript sources, so they must be bundled, never
// externalized. electron-vite externalizes the app's own `dependencies` in main and preload
// by default; we exclude the @diabase/* ones. Anything else listed in `dependencies` stays
// external and is resolved from node_modules at runtime: that is where native modules
// (@parcel/watcher, esbuild, ...) belong once the main-half plugins are wired in.
const pkg = JSON.parse(readFileSync(new URL('./package.json', import.meta.url), 'utf8'))
const workspaceDeps = Object.keys(pkg.dependencies ?? {}).filter((name) => name.startsWith('@diabase/'))

function diabaseCsp(): Plugin {
  let dev = false
  return {
    name: 'diabase:csp',
    configResolved(config) {
      dev = config.command === 'serve'
    },
    transformIndexHtml: {
      order: 'pre',
      handler(html) {
        if (!html.includes('__DIABASE_CSP__')) throw new Error('index.html is missing the __DIABASE_CSP__ placeholder')
        return html.replace('__DIABASE_CSP__', buildCsp(dev ? 'development' : 'production'))
      },
    },
  }
}

export default defineConfig({
  main: {
    build: { externalizeDeps: { exclude: workspaceDeps } },
  },
  preload: {
    build: {
      externalizeDeps: { exclude: workspaceDeps },
      // Sandboxed preloads cannot be ES modules, even though the package is "type": "module".
      rolldownOptions: { output: { format: 'cjs' } },
    },
  },
  renderer: {
    plugins: [react(), diabaseCsp()],
  },
})
