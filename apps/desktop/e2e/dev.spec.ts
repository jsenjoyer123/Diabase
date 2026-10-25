import { test as base, expect } from '@playwright/test'
import { resolveConfig } from 'electron-vite'
import type { ViteDevServer } from 'vite'
import { createServer } from 'vite'
import { fileURLToPath } from 'node:url'
import { launchDesktop } from './fixtures.ts'

const appDir = fileURLToPath(new URL('..', import.meta.url))

// The dev path without `electron-vite dev` (which would start an unmanaged Electron): serve the
// renderer with the same electron-vite config and point the built main at it via
// ELECTRON_RENDERER_URL, exactly what `electron-vite dev` does.
base('dev: loads the renderer from the Vite dev server under the dev CSP and still handshakes', async () => {
  process.env.NODE_ENV_ELECTRON_VITE = 'development'
  const resolved = await resolveConfig({ root: appDir, logLevel: 'error' }, 'serve', 'development')
  let server: ViteDevServer | undefined
  let desktop: Awaited<ReturnType<typeof launchDesktop>> | undefined
  try {
    server = await createServer(resolved.config!.renderer!)
    await server.listen()
    const devServerUrl = server.resolvedUrls!.local[0]!
    expect(devServerUrl).toMatch(/^http:\/\/localhost:\d+\/$/)

    desktop = await launchDesktop({ devServerUrl })
    const { page, app } = desktop
    const violations: string[] = []
    page.on('console', (message) => {
      const text = message.text()
      // Chromium ignores frame-ancestors in a <meta> policy and says so on every load (see csp.ts)
      if (/frame-ancestors.*ignored/.test(text)) return
      if (/Content Security Policy|Refused to/i.test(text)) violations.push(text)
    })
    await page.reload()

    await expect(page.getByTestId('echo-result')).toContainText('echo: ok')
    expect(page.url()).toBe(devServerUrl)
    expect(await app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.isVisible())).toBe(false)

    const csp = await page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
    expect(csp).toContain("script-src 'self' blob: 'unsafe-inline'")
    expect(csp).toContain('ws://localhost:*')
    expect(csp).not.toContain('unsafe-eval')
    expect(await page.evaluate(() => Object.keys(window.diabase))).toEqual(['connect'])
    expect(violations).toEqual([])
  } finally {
    await desktop?.dispose()
    await server?.close()
  }
})
