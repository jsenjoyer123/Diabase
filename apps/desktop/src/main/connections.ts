import { MessageChannelMain, ipcMain } from 'electron'
import type { IpcMainEvent, MessagePortMain, WebContents } from 'electron'
import { logError } from './log.ts'

export const CONNECT_CHANNEL = 'diabase:connect'
export const PORT_CHANNEL = 'diabase:port'

type Teardown = () => void | Promise<void>

export interface ConnectionOptions {
  /** True only for IPC from the top frame of one of our windows showing our own page. */
  isTrusted: (event: IpcMainEvent) => boolean
  /** Wires the main end of a new channel; see `attachConnection` in ./boot.ts. */
  attach: (port: MessagePortMain, sender: WebContents) => Teardown
}

export interface Connections {
  /** Number of live connections (one per webContents at most). */
  size: () => number
  /** Unregisters the handler and closes every connection. */
  dispose: () => Promise<void>
}

interface Connection {
  close: () => Promise<void>
}

/**
 * One live MessagePort per webContents. A new `diabase:connect` from the same webContents
 * (renderer reload) closes and replaces the previous connection.
 */
export function registerConnections(options: ConnectionOptions): Connections {
  const live = new Map<number, Connection>()

  const open = (sender: WebContents) => {
    const id = sender.id
    void live.get(id)?.close()

    const { port1, port2 } = new MessageChannelMain()
    let teardown: Teardown = () => {}
    let closing: Promise<void> | undefined
    const connection: Connection = {
      close: () =>
        (closing ??= (async () => {
          if (live.get(id) === connection) live.delete(id)
          if (!sender.isDestroyed()) sender.off('destroyed', connection.close)
          port1.close()
          try {
            await teardown()
          } catch (error) {
            logError('connection teardown failed:', error)
          }
        })()),
    }
    try {
      teardown = options.attach(port1, sender)
    } catch (error) {
      logError('connection attach failed:', error)
      port1.close()
      port2.close()
      return
    }
    live.set(id, connection)
    port1.once('close', () => void connection.close())
    sender.once('destroyed', connection.close)
    sender.postMessage(PORT_CHANNEL, null, [port2])
  }

  const onConnect = (event: IpcMainEvent) => {
    if (!options.isTrusted(event)) {
      logError('rejected connect from untrusted sender:', event.senderFrame?.url ?? '(no frame)')
      return
    }
    open(event.sender)
  }
  ipcMain.on(CONNECT_CHANNEL, onConnect)

  return {
    size: () => live.size,
    dispose: async () => {
      ipcMain.off(CONNECT_CHANNEL, onConnect)
      await Promise.all([...live.values()].map((connection) => connection.close()))
    },
  }
}
