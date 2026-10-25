import { mkdir, mkdtemp, realpath, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { findRepoRoot } from '../src/main/repo-root.ts'
import { resolveVaultRoot, toVaultRoot, VaultRootError } from '../src/main/vault-root.ts'
import type { VaultRootOptions } from '../src/main/vault-root.ts'

let base: string

beforeEach(async () => {
  base = await realpath(await mkdtemp(join(tmpdir(), 'diabase-desktop-test-')))
})

afterEach(() => rm(base, { recursive: true, force: true }))

async function fakeRepo(withFixture: boolean) {
  const repo = join(base, 'repo')
  const codeDir = join(repo, 'apps', 'desktop', 'out', 'main')
  await mkdir(codeDir, { recursive: true })
  await writeFile(join(repo, 'package.json'), JSON.stringify({ name: 'diabase', workspaces: ['apps/*'] }))
  await writeFile(join(repo, 'apps', 'desktop', 'package.json'), JSON.stringify({ name: '@diabase/desktop' }))
  const fixture = join(repo, 'fixtures', 'vaults', 'sample')
  if (withFixture) await mkdir(fixture, { recursive: true })
  return { repo, codeDir, fixture }
}

const options = (over: Partial<VaultRootOptions>): VaultRootOptions => ({
  argv: ['electron', '.'],
  env: {},
  codeDir: base,
  isPackaged: false,
  allowDevDefault: true,
  pickDirectory: async () => undefined,
  ...over,
})

describe('findRepoRoot', () => {
  it('finds the nearest ancestor declaring workspaces, regardless of cwd', async () => {
    const { repo, codeDir } = await fakeRepo(false)
    expect(findRepoRoot(codeDir)).toBe(repo)
    expect(findRepoRoot(join(repo, 'apps', 'desktop'))).toBe(repo)
  })

  it('returns undefined outside a workspace repo', async () => {
    expect(findRepoRoot(base)).toBeUndefined()
  })
})

describe('toVaultRoot', () => {
  it('returns the realpath of a directory', async () => {
    const real = join(base, 'real')
    await mkdir(real)
    await symlink(real, join(base, 'link'))
    expect(await toVaultRoot(join(base, 'link'))).toBe(real)
  })

  it('rejects missing paths and files', async () => {
    await writeFile(join(base, 'file.md'), '')
    await expect(toVaultRoot(join(base, 'nope'))).rejects.toBeInstanceOf(VaultRootError)
    await expect(toVaultRoot(join(base, 'file.md'))).rejects.toThrow(/not a directory/)
  })
})

describe('resolveVaultRoot', () => {
  it('prefers --vault over DIABASE_VAULT over the dev default over the dialog', async () => {
    const { codeDir } = await fakeRepo(true)
    const a = join(base, 'a')
    const b = join(base, 'b')
    await mkdir(a)
    await mkdir(b)
    let asked = false
    const pickDirectory = async () => ((asked = true), undefined)

    expect(await resolveVaultRoot(options({ argv: ['x', '--vault', a], env: { DIABASE_VAULT: b }, codeDir, pickDirectory }))).toEqual({ root: a, source: 'arg' })
    expect(await resolveVaultRoot(options({ env: { DIABASE_VAULT: b }, codeDir, pickDirectory }))).toEqual({ root: b, source: 'env' })
    const fallback = await resolveVaultRoot(options({ codeDir, pickDirectory }))
    expect(fallback?.source).toBe('dev-default')
    expect(fallback?.root.endsWith(join('fixtures', 'vaults', 'sample'))).toBe(true)
    expect(asked).toBe(false)
  })

  it('opens the dialog when packaged, when E2E, or when the fixture is missing', async () => {
    const withFixture = await fakeRepo(true)
    const picked = join(base, 'picked')
    await mkdir(picked)
    const pickDirectory = async () => picked
    expect(await resolveVaultRoot(options({ codeDir: withFixture.codeDir, isPackaged: true, pickDirectory }))).toEqual({ root: picked, source: 'dialog' })
    expect(await resolveVaultRoot(options({ codeDir: withFixture.codeDir, allowDevDefault: false, pickDirectory }))).toEqual({ root: picked, source: 'dialog' })

    await rm(withFixture.fixture, { recursive: true })
    expect(await resolveVaultRoot(options({ codeDir: withFixture.codeDir, pickDirectory }))).toEqual({ root: picked, source: 'dialog' })
  })

  it('resolves to undefined when the dialog is cancelled', async () => {
    expect(await resolveVaultRoot(options({}))).toBeUndefined()
  })

  it('does not fall back to the dialog when an explicit path is invalid', async () => {
    let asked = false
    const pickDirectory = async () => ((asked = true), base)
    await expect(resolveVaultRoot(options({ argv: ['x', '--vault', join(base, 'missing')], pickDirectory }))).rejects.toBeInstanceOf(VaultRootError)
    expect(asked).toBe(false)
  })
})
