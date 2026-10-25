import { z } from 'zod'

/** Part of every build hash: bump when the runtime bundle format (README §5/§6) changes. */
export const BUNDLE_FORMAT = 1

/** Electron 45's Chromium; bump together with Electron. Part of every build hash. */
export const BUNDLE_TARGET = 'chrome154'

const KIB = 1024
const MIB = 1024 * KIB

/** Plugin config (README §8). Every key is optional; `prefault` lets `ctx.plugin(Bundler)` pass no config at all. */
export const BundlerConfigSchema = z
  .object({
    /** ms per build, covering the vault snapshot and esbuild. */
    timeout: z.number().int().positive().default(15_000),
    /** LRU entries; 0 disables the cache. */
    cacheSize: z.number().int().min(0).default(64),
    /** Files in a snapshot. */
    maxFiles: z.number().int().positive().default(256),
    /** Bytes per input file. */
    maxFileBytes: z.number().int().positive().default(MIB),
    /** Bytes in the whole snapshot. */
    maxInputBytes: z.number().int().positive().default(4 * MIB),
    /** `code` without the inline sourcemap. */
    maxBundleBytes: z.number().int().positive().default(MIB),
    /** `css` without its sourcemap. */
    maxCssBytes: z.number().int().positive().default(512 * KIB),
    /** Inline sourcemaps in `code` and `css`. */
    sourcemap: z.boolean().default(true),
    /** Permit the dynamic-code patterns of README §10. */
    allowDynamicCode: z.boolean().default(false),
  })
  .prefault({})

export type BundlerConfigInput = z.input<typeof BundlerConfigSchema>
export type BundlerConfig = z.output<typeof BundlerConfigSchema>

/** The config keys that change the produced result (everything except `timeout` and `cacheSize`); hash input. */
export function outputAffectingConfig(config: BundlerConfig) {
  return {
    maxFiles: config.maxFiles,
    maxFileBytes: config.maxFileBytes,
    maxInputBytes: config.maxInputBytes,
    maxBundleBytes: config.maxBundleBytes,
    maxCssBytes: config.maxCssBytes,
    sourcemap: config.sourcemap,
    allowDynamicCode: config.allowDynamicCode,
  }
}
