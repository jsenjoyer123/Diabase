import { app, dialog } from 'electron'
import { join } from 'node:path'
import { resolveAppTarget, resolveDevServerUrl } from './app-url.ts'
import { attachConnection, boot, shutdown } from './boot.ts'
import { registerConnections } from './connections.ts'
import type { Connections } from './connections.ts'
import { log, logError } from './log.ts'
import { applySecurityPolicy } from './security.ts'
import { resolveVaultRoot } from './vault-root.ts'
import { createMainWindow, isTrustedSender, windows } from './window.ts'

// electron-vite lays the build out as out/{main,preload,renderer}
const codeDir = import.meta.dirname
const e2e = process.env.DIABASE_E2E === '1'

const target = resolveAppTarget({
  devServerUrl: resolveDevServerUrl(process.env.ELECTRON_RENDERER_URL, app.isPackaged),
  rendererIndex: join(codeDir, '../renderer/index.html'),
})

app.enableSandbox()
applySecurityPolicy(target)

let connections: Connections | undefined

async function main() {
  await app.whenReady()

  const vault = await resolveVaultRoot({
    argv: process.argv,
    env: process.env,
    codeDir,
    isPackaged: app.isPackaged,
    allowDevDefault: !e2e,
    pickDirectory: async () => {
      // E2E and CI must never block on (or show) a native dialog
      if (e2e) throw new Error('no vault given (--vault or DIABASE_VAULT) in E2E mode')
      const result = await dialog.showOpenDialog({ title: 'Open vault', properties: ['openDirectory'] })
      return result.canceled ? undefined : result.filePaths[0]
    },
  })
  if (!vault) return app.quit()
  log(`vault (${vault.source}):`, vault.root)

  await boot(vault.root)
  connections = registerConnections({
    isTrusted: (event) => isTrustedSender(event, target),
    attach: attachConnection,
  })
  createMainWindow({ target, preload: join(codeDir, '../preload/index.cjs'), hidden: e2e })

  // Read-only probe for the Playwright E2E (via app.evaluate); not present in normal runs.
  if (e2e) {
    Object.assign(globalThis, {
      __diabaseE2E: { vaultRoot: vault.root, vaultSource: vault.source, connections: () => connections?.size() ?? 0 },
    })
  }
}

app.on('window-all-closed', () => app.quit())

// Quit is deferred once so the Cordis root can dispose (closing ports, watchers, ...).
let disposed = false
app.on('before-quit', (event) => {
  if (disposed) return
  event.preventDefault()
  disposed = true
  Promise.resolve(connections?.dispose())
    .then(shutdown)
    .catch((error) => logError('shutdown failed:', error))
    .finally(() => app.quit())
})

for (const signal of ['SIGINT', 'SIGTERM'] as const) process.on(signal, () => app.quit())

main().catch((error) => {
  logError(error instanceof Error ? error.message : error)
  if (!e2e) dialog.showErrorBox('Diabase could not start', error instanceof Error ? error.message : String(error))
  app.exit(1)
})
