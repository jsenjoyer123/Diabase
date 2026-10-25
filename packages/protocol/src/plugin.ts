// Plugin package manifest and the vault's `.diabase/` layout.
import { z } from 'zod'
import { BlockManifest } from './blocks.ts'

/** `.diabase/` directory conventions (relative to the vault root). */
export const DIABASE_DIR = '.diabase'
export const PLUGINS_DIR = `${DIABASE_DIR}/plugins`
export const BLOCKS_DIR = `${DIABASE_DIR}/blocks`
export const WORKSPACES_DIR = `${DIABASE_DIR}/workspaces`
export const TRASH_DIR = `${DIABASE_DIR}/trash`
export const CACHE_DIR = `${DIABASE_DIR}/cache`
/** Enabled-plugin list and per-plugin config (YAML). */
export const CONFIG_FILE = `${DIABASE_DIR}/config.yml`

/**
 * `diabase.plugin.json` — static description of a plugin package. Read without
 * executing plugin code, so the host and the GenUI agent can discover what a
 * plugin contributes (generalizes Noteriv's `codeBlockLanguages`).
 */
export const PluginManifest = z.object({
  id: z.string().regex(/^[a-z0-9][a-z0-9-]*(\/[a-z0-9][a-z0-9-]*)?$/),
  name: z.string(),
  version: z.string(),
  description: z.string().default(''),
  /** Entry evaluated in the Electron main process (Node). */
  main: z.string().optional(),
  /** Entry evaluated in the renderer. */
  renderer: z.string().optional(),
  contributes: z
    .object({
      blocks: z.array(BlockManifest).default([]),
      /** Named runtime slots this plugin contributes components to. */
      slots: z.array(z.string()).default([]),
      /** Markdown fence languages rendered by this plugin. */
      fences: z.array(z.string()).default([]),
      services: z.array(z.string()).default([]),
    })
    .default({ blocks: [], slots: [], fences: [], services: [] }),
})
export type PluginManifest = z.infer<typeof PluginManifest>

/**
 * One entry of `plugins:` in `.diabase/config.yml`. Plugins not listed are installed but
 * disabled: main-process code never runs without an explicit entry.
 *
 * ```yaml
 * plugins:
 *   my-plugin:            # listing a plugin enables it
 *     config:             # passed to the plugin as its Cordis config
 *       greeting: hello
 *   ns/other-plugin:
 *     enabled: false      # installed, but kept off
 * ```
 */
export const PluginEntryConfig = z.object({
  /** Default true: listing a plugin enables it. */
  enabled: z.boolean().default(true),
  /** Passed as the Cordis plugin config (validated by the plugin's own `Config` schema, if any). */
  config: z.record(z.string(), z.unknown()).optional(),
})
export type PluginEntryConfig = z.infer<typeof PluginEntryConfig>

/** `.diabase/config.yml`. A missing or empty file means `{ plugins: {} }`; unknown top-level keys are kept. */
export const DiabaseConfig = z.looseObject({
  plugins: z.record(z.string(), PluginEntryConfig).default({}),
})
export type DiabaseConfig = z.infer<typeof DiabaseConfig>
