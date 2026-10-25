import { Context } from '@diabase/kernel'
import type { Fiber } from '@diabase/kernel'
import type { MessagePortMain, WebContents } from 'electron'
import { serveEcho } from './echo.ts'
import { log } from './log.ts'

export interface MainRuntime {
  readonly root: Context
  readonly vaultRoot: string
}

let runtime: MainRuntime | undefined

/** Creates the main-process Cordis root context for `vaultRoot` and plugs the main-half plugins. */
export async function boot(vaultRoot: string): Promise<MainRuntime> {
  if (runtime) throw new Error('main context already booted')
  const root = new Context()
  runtime = { root, vaultRoot }

  // PLUG POINT (main-half plugins). Vault, index, search, bundler and the plugin loader come
  // from their own packages and are plugged here, each with `{ root: vaultRoot }`. They are
  // deliberately not stubbed in the shell.

  log('main context ready, vault:', vaultRoot)
  return runtime
}

/**
 * Called once per renderer connection with the main end of a fresh MessageChannel. Must register
 * its listeners and then call `port.start()`. Returns the teardown run when the connection ends
 * (port closed, renderer reloaded or destroyed, app quitting).
 */
export function attachConnection(port: MessagePortMain, _sender: WebContents): () => void | Promise<void> {
  // PLUG POINT (bridge): replace the echo with a per-connection Bridge fiber, e.g.
  //   const fiber = runtime.root.plugin(Bridge, { transport: electronPortTransport(port), ... })
  //   return () => fiber.dispose()
  return serveEcho(port)
}

/** Disposes every top-level fiber, newest first, then forgets the context. Safe to call twice. */
export async function shutdown(): Promise<void> {
  const current = runtime
  runtime = undefined
  if (!current) return
  await disposeTopLevel(current.root)
  log('main context disposed')
}

async function disposeTopLevel(root: Context): Promise<void> {
  const fibers: Fiber[] = []
  for (const entry of root.registry.values()) {
    for (const fiber of entry.fibers) if (fiber.parent === root) fibers.push(fiber)
  }
  fibers.sort((a, b) => (b.uid ?? 0) - (a.uid ?? 0))
  for (const fiber of fibers) await fiber.dispose()
}
