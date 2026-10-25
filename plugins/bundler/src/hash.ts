// Input hash (README §7): computed from the snapshot before building, embedded in the bundle.
import { SHARED_MODULES } from '@diabase/protocol'
import { BUNDLE_FORMAT, BUNDLE_TARGET, outputAffectingConfig, type BundlerConfig } from './config.ts'
import { sha256Hex, type Snapshot } from './snapshot.ts'

/**
 * `"sha256-" + hex(sha256(canonical JSON))`. The JSON is built with a fixed key order and sorted
 * file lists, so equal inputs always hash equal. Everything that can change the produced result is
 * part of it: format version, esbuild version, target, shared modules, output-affecting config,
 * the source identity, and the snapshot (including unsupported file names, which only change error
 * messages).
 */
export function computeHash(snapshot: Snapshot, config: BundlerConfig, esbuildVersion: string): string {
  const canonical = JSON.stringify({
    format: BUNDLE_FORMAT,
    esbuild: esbuildVersion,
    target: BUNDLE_TARGET,
    shared: SHARED_MODULES,
    config: outputAffectingConfig(config),
    kind: snapshot.kind,
    id: snapshot.id,
    entry: snapshot.entry,
    files: [...snapshot.files].map(([path, file]) => [path, file.sha256]),
    ignored: snapshot.ignored,
  })
  return `sha256-${sha256Hex(canonical)}`
}
