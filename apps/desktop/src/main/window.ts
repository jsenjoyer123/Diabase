import { BrowserWindow } from 'electron'
import type { IpcMainEvent } from 'electron'
import { isAppUrl } from './app-url.ts'
import type { AppTarget } from './app-url.ts'
import { logError } from './log.ts'

export interface WindowOptions {
  target: AppTarget
  preload: string
  /** DIABASE_E2E=1: never show the window. */
  hidden: boolean
}

export const windows = new Set<BrowserWindow>()

export function createMainWindow(options: WindowOptions): BrowserWindow {
  const window = new BrowserWindow({
    width: 1100,
    height: 760,
    show: false,
    title: 'Diabase',
    backgroundColor: '#ffffff',
    webPreferences: {
      preload: options.preload,
      contextIsolation: true,
      sandbox: true,
      nodeIntegration: false,
      nodeIntegrationInWorker: false,
      nodeIntegrationInSubFrames: false,
      webSecurity: true,
      allowRunningInsecureContent: false,
      webviewTag: false,
      spellcheck: false,
    },
  })
  windows.add(window)
  window.webContents.on("console-message", (event: any, ...rest: any[]) => {
    const msg = (typeof event === "object" && event?.message) ? event.message : (rest[1] || event);
    console.log(`[Renderer Console] ${msg}`);
  });
  window.webContents.on("did-fail-load", (_e, code, desc, url) => {
    console.error(`[Renderer did-fail-load] ${code} ${desc} ${url}`);
  });
  window.once('closed', () => windows.delete(window))
  if (!options.hidden) window.once('ready-to-show', () => window.show())

  const { target } = options
  const loaded = target.kind === 'dev' ? window.loadURL(target.url) : window.loadFile(target.path)
  loaded.catch((error) => logError('failed to load', target.url, error))
  return window
}

/** An IPC sender is trusted only if it is the top frame of one of our windows, on our own page. */
export function isTrustedSender(
  event: Pick<IpcMainEvent, 'sender' | 'senderFrame'>,
  target: AppTarget,
): boolean {
  const { sender, senderFrame } = event
  if (!senderFrame || senderFrame.parent !== null) return false
  const window = BrowserWindow.fromWebContents(sender)
  if (!window || !windows.has(window)) return false
  return isAppUrl(senderFrame.url, target)
}
