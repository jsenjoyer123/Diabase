import { readFile } from 'node:fs/promises'
import { expect, test } from './fixtures.ts'

const SECTIONS = ['bridge-status', 'services', 'inspector', 'file-list', 'event-log']

test('opens a hidden window with the console page and every section', async ({ desktop }) => {
  const { app, page, vaultReal } = desktop
  for (const id of SECTIONS) await expect(page.getByTestId(id)).toBeVisible()

  const windows = await app.evaluate(({ BrowserWindow }) =>
    BrowserWindow.getAllWindows().map((window) => ({ visible: window.isVisible(), url: window.webContents.getURL() })),
  )
  expect(windows).toHaveLength(1)
  expect(windows[0]!.visible).toBe(false)
  expect(windows[0]!.url).toMatch(/^file:\/\/.*\/out\/renderer\/index\.html$/)

  const probe = await app.evaluate(() => {
    const { vaultRoot, vaultSource } = (globalThis as any).__diabaseE2E
    return { vaultRoot, vaultSource }
  })
  expect(probe).toEqual({ vaultRoot: vaultReal, vaultSource: 'arg' })
  await expect(page.getByTestId('services')).toContainText('waiting for bridge')
  await expect(page.getByTestId('event-log')).toContainText('no events yet')
})

test('ships a strict CSP', async ({ desktop }) => {
  const csp = await desktop.page.locator('meta[http-equiv="Content-Security-Policy"]').getAttribute('content')
  expect(csp).toBeTruthy()
  const directives = new Map(csp!.split(';').map((part) => {
    const [name, ...sources] = part.trim().split(/\s+/)
    return [name, sources] as const
  }))
  expect(csp).not.toContain('unsafe-eval')
  expect(directives.get('script-src')).toEqual(["'self'", 'blob:'])
  expect(directives.get('connect-src')).toEqual(["'self'"])
  expect(directives.get('object-src')).toEqual(["'none'"])
  expect(directives.get('frame-ancestors')).toEqual(["'none'"])
})

test('the renderer has no Node and exposes only the handshake', async ({ desktop }) => {
  const globals = await desktop.page.evaluate(() => ({
    require: typeof (window as any).require,
    process: typeof (globalThis as any).process,
    module: typeof (globalThis as any).module,
    buffer: typeof (globalThis as any).Buffer,
    ipcRenderer: typeof (window as any).ipcRenderer,
    connect: typeof window.diabase.connect,
    keys: Object.keys(window.diabase),
  }))
  expect(globals).toEqual({
    require: 'undefined',
    process: 'undefined',
    module: 'undefined',
    buffer: 'undefined',
    ipcRenderer: 'undefined',
    connect: 'function',
    keys: ['connect'],
  })
})

test('the renderer process runs inside the Chromium sandbox', async ({ desktop }) => {
  test.skip(process.platform !== 'linux', 'probes /proc')
  const pid = await desktop.app.evaluate(({ BrowserWindow }) => BrowserWindow.getAllWindows()[0]!.webContents.getOSProcessId())

  // Seccomp-BPF filter mode (2) is only installed on sandboxed Chromium child processes.
  const status = await readFile(`/proc/${pid}/status`, 'utf8')
  expect(status).toMatch(/^Seccomp:\s+2$/m)
  expect(status).toMatch(/^NoNewPrivs:\s+1$/m)
})

test('hands a MessagePort to the renderer and echoes through it', async ({ desktop }) => {
  const { page } = desktop
  await expect(page.getByTestId('port-received')).toHaveText('port received: yes')
  await expect(page.getByTestId('bridge-phase')).toHaveText('phase: connected')
  await expect(page.getByTestId('echo-result')).toContainText('echo: ok')
  await expect(page.getByTestId('bridge-error')).toHaveCount(0)
})

test('a reload replaces the connection and the handshake succeeds again', async ({ desktop }) => {
  const { app, page } = desktop
  const connections = () => app.evaluate(() => (globalThis as any).__diabaseE2E.connections() as number)
  await expect(page.getByTestId('echo-result')).toContainText('echo: ok')
  expect(await connections()).toBe(1)

  await page.evaluate(() => ((window as any).__beforeReload = true))
  await page.reload()
  await expect(page.getByTestId('echo-result')).toContainText('echo: ok')
  await expect(page.getByTestId('port-received')).toHaveText('port received: yes')
  expect(await page.evaluate(() => (window as any).__beforeReload)).toBeUndefined()
  expect(await connections()).toBe(1)
})

test('refuses popups and foreign navigation', async ({ desktop }) => {
  const { app, page } = desktop
  await page.evaluate(() => {
    window.open('https://example.invalid/popup')
    window.location.href = 'https://example.invalid/navigate'
  })
  // Give a (wrongly) allowed popup or navigation time to show up. Inspected from main:
  // Playwright itself keeps waiting for a navigation that was cancelled.
  await new Promise((resolve) => setTimeout(resolve, 500))
  const state = await app.evaluate(({ BrowserWindow }) => {
    const windows = BrowserWindow.getAllWindows()
    return { count: windows.length, url: windows[0]!.webContents.getURL(), loading: windows[0]!.webContents.isLoading() }
  })
  expect(state.count).toBe(1)
  expect(state.url).toMatch(/^file:\/\/.*\/index\.html$/)
  expect(state.loading).toBe(false)
})

test('shuts the Cordis root down on quit', async ({ desktop }) => {
  await expect(desktop.page.getByTestId('echo-result')).toContainText('echo: ok')
  const output = await desktop.close()
  expect(output).toContain('main context disposed')
})
