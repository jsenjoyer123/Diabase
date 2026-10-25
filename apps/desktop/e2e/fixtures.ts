import { _electron as electron, test as base } from '@playwright/test'
import type { ElectronApplication, Page } from '@playwright/test'
import { cp, mkdir, mkdtemp, realpath, rm, writeFile } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const appDir = fileURLToPath(new URL('..', import.meta.url))
const repoRoot = fileURLToPath(new URL('../../..', import.meta.url))
const mainEntry = join(appDir, 'out/main/index.js')
const sampleVault = join(repoRoot, 'fixtures/vaults/sample')

export interface Desktop {
  app: ElectronApplication
  page: Page
  /** Temp copy of the vault the app was started on (safe to mutate). */
  vault: string
  /** Real path of `vault` (what main resolves it to). */
  vaultReal: string
  /** Everything the app wrote to stdout/stderr since launch resolved. */
  output: () => string
  /** Quits the app (idempotent) and resolves with its full output. */
  close: () => Promise<string>
}

export interface LaunchOptions {
  /** Point the window at a running renderer dev server (the dev-mode path). */
  devServerUrl?: string
}

/** Copy of the repo fixture when it exists, else a tiny hand-made vault. Never touches the original. */
async function createTempVault(dir: string): Promise<void> {
  if (existsSync(sampleVault)) {
    await cp(sampleVault, dir, { recursive: true })
    return
  }
  await mkdir(join(dir, 'notes'), { recursive: true })
  await writeFile(join(dir, 'welcome.md'), '---\ntitle: Welcome\n---\n\n# Welcome\n\nLinks to [[idea]].\n')
  await writeFile(join(dir, 'notes/idea.md'), '# Idea\n\n#diabase\n')
}

// Graceful quit first (exercises before-quit -> Cordis dispose); SIGKILL if it hangs.
async function quit(app: ElectronApplication, exited: Promise<unknown>): Promise<void> {
  const proc = app.process()
  let timer: NodeJS.Timeout | undefined
  const timeout = new Promise<'timeout'>((resolve) => (timer = setTimeout(() => resolve('timeout'), 8_000)))
  try {
    const result = await Promise.race([app.close().then(() => exited).then(() => 'closed' as const), timeout])
    if (result === 'timeout') proc.kill('SIGKILL')
  } catch {
    proc.kill('SIGKILL')
  } finally {
    clearTimeout(timer)
  }
}

/**
 * The only way tests start Electron. The window is always hidden (DIABASE_E2E=1) and, on top of
 * that, Chromium runs on ozone's headless platform so no surface ever reaches the desktop session.
 */
export async function launchDesktop(
  options: LaunchOptions = {},
): Promise<Desktop & { dispose: () => Promise<void> }> {
  const dir = await mkdtemp(join(tmpdir(), 'diabase-e2e-'))
  const vault = join(dir, 'vault')
  const dispose = async (close?: () => Promise<unknown>) => {
    await close?.()
    await rm(dir, { recursive: true, force: true })
  }

  try {
    await mkdir(vault)
    await createTempVault(vault)

    const env: Record<string, string> = {}
    for (const [key, value] of Object.entries(process.env)) {
      if (value !== undefined && key !== 'ELECTRON_RENDERER_URL' && key !== 'ELECTRON_RUN_AS_NODE') env[key] = value
    }
    env.DIABASE_E2E = '1'
    if (options.devServerUrl) env.ELECTRON_RENDERER_URL = options.devServerUrl

    const app = await electron.launch({
      args: [mainEntry, '--ozone-platform=headless', `--user-data-dir=${join(dir, 'user-data')}`, '--vault', vault],
      env,
      // Playwright adds --no-sandbox unless this is set. (app.enableSandbox() forces the sandbox on
      // regardless, but keep the launch honest.)
      chromiumSandbox: true,
      timeout: 20_000,
    })

    // Only output after launch resolves is captured; startup logs are gone by then.
    let output = ''
    const proc = app.process()
    proc.stdout?.on('data', (chunk) => (output += chunk))
    proc.stderr?.on('data', (chunk) => (output += chunk))
    const exited = new Promise((resolve) => proc.once('close', resolve))

    let closed = false
    const close = async () => {
      if (!closed) {
        closed = true
        await quit(app, exited)
      }
      return output
    }
    try {
      const page = await app.firstWindow()
      return {
        app,
        page,
        vault,
        vaultReal: await realpath(vault),
        output: () => output,
        close,
        dispose: () => dispose(close),
      }
    } catch (error) {
      await close()
      throw error
    }
  } catch (error) {
    await dispose()
    throw error
  }
}

export const test = base.extend<{ desktop: Desktop }>({
  desktop: async ({}, use) => {
    const desktop = await launchDesktop()
    try {
      await use(desktop)
    } finally {
      await desktop.dispose()
    }
  },
})

export { expect } from '@playwright/test'
