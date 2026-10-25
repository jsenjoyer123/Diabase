// Node-only kernel parts for the Electron main process. Import via `@diabase/kernel/main`;
// the renderer bundle must never reach this module.
export { PluginLoader } from './loader.ts'
export type { Importer, PluginLoaderOptions } from './loader.ts'
