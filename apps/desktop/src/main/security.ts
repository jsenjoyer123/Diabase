import { app, session } from 'electron'
import type { WebContents } from 'electron'
import { isAppUrl } from './app-url.ts'
import type { AppTarget } from './app-url.ts'
import { logError } from './log.ts'

/** Process-wide hardening. Call before the first window is created. */
export function applySecurityPolicy(target: AppTarget): void {
  app.on('web-contents-created', (_event, contents) => lockDown(contents, target))

  app.whenReady().then(() => {
    const { defaultSession } = session
    defaultSession.setPermissionRequestHandler((_contents, _permission, callback) => callback(false))
    defaultSession.setPermissionCheckHandler(() => false)
    defaultSession.setDevicePermissionHandler(() => false)
  })
}

function lockDown(contents: WebContents, target: AppTarget): void {
  contents.setWindowOpenHandler(() => ({ action: 'deny' }))

  const guard = (event: { preventDefault: () => void }, url: string) => {
    if (isAppUrl(url, target)) return
    logError('blocked navigation to', url)
    event.preventDefault()
  }
  contents.on('will-navigate', (event) => guard(event, event.url))
  contents.on('will-frame-navigate', (event) => guard(event, event.url))
  contents.on('will-redirect', (event) => guard(event, event.url))

  contents.on('will-attach-webview', (event) => event.preventDefault())
}
