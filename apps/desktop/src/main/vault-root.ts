import { realpath, stat } from 'node:fs/promises'
import { existsSync } from 'node:fs'
import { join, resolve } from 'node:path'
import { parseVaultArg } from './vault-arg.ts'
import { findRepoRoot } from './repo-root.ts'

export type VaultSource = 'arg' | 'env' | 'dev-default' | 'dialog'

export interface VaultRootOptions {
  argv: readonly string[]
  env: Record<string, string | undefined>
  /** Directory the running code lives in; used to locate the repo root in dev. */
  codeDir: string
  isPackaged: boolean
  /** E2E runs must never pick the repo fixture implicitly (the app would mutate it). */
  allowDevDefault: boolean
  /** Native folder picker; resolves to undefined when cancelled. */
  pickDirectory: () => Promise<string | undefined>
}

export interface ResolvedVault {
  root: string
  source: VaultSource
}

export class VaultRootError extends Error {
  override name = 'VaultRootError'
}

export const DEV_DEFAULT_VAULT = join('fixtures', 'vaults', 'sample')

/** Resolves to undefined when the user cancels the picker (the app should quit). */
export async function resolveVaultRoot(options: VaultRootOptions): Promise<ResolvedVault | undefined> {
  const explicit = pickExplicit(options)
  if (explicit) return { root: await toVaultRoot(explicit.path), source: explicit.source }
  const picked = await options.pickDirectory()
  if (picked === undefined) return undefined
  return { root: await toVaultRoot(picked), source: 'dialog' }
}

function pickExplicit(options: VaultRootOptions): { path: string; source: VaultSource } | undefined {
  const fromArg = parseVaultArg(options.argv)
  if (fromArg) return { path: fromArg, source: 'arg' }
  const fromEnv = options.env.DIABASE_VAULT
  if (fromEnv) return { path: fromEnv, source: 'env' }
  if (!options.isPackaged && options.allowDevDefault) {
    const repoRoot = findRepoRoot(options.codeDir)
    const fixture = repoRoot && join(repoRoot, DEV_DEFAULT_VAULT)
    if (fixture && existsSync(fixture)) return { path: fixture, source: 'dev-default' }
  }
  return undefined
}

/** Absolute, symlink-free path of an existing directory. */
export async function toVaultRoot(input: string): Promise<string> {
  let real: string
  try {
    real = await realpath(resolve(input))
  } catch {
    throw new VaultRootError(`Vault path does not exist: ${input}`)
  }
  if (!(await stat(real)).isDirectory()) throw new VaultRootError(`Vault path is not a directory: ${input}`)
  return real
}
