// Test-only `vault` service over a real directory: just enough of VaultService for the loader.
import { createHash } from 'node:crypto'
import * as fs from 'node:fs/promises'
import * as path from 'node:path'
import type { FileContent, FileEntry, ListOptions, VaultPath } from '@diabase/protocol'
import { Service } from '@diabase/kernel'
import type { Context } from '@diabase/kernel'

const vaultError = (code: string, p: VaultPath, message: string) =>
  Object.assign(new Error(message), { name: 'VaultError', code, path: p })

export interface FsVaultConfig {
  root: string
}

// Cordis hands services out as Proxies, so methods must not use ES `#private` members.
function resolveInside(dir: string, p: VaultPath) {
  const abs = path.resolve(dir, p)
  if (abs !== dir && !abs.startsWith(dir + path.sep)) throw vaultError('EOUTSIDE', p, `${p} is outside the vault`)
  return abs
}

async function run<T>(dir: string, p: VaultPath, fn: (abs: string) => Promise<T>): Promise<T> {
  try {
    return await fn(resolveInside(dir, p))
  } catch (error) {
    const code = (error as NodeJS.ErrnoException).code
    if (code === 'ENOENT' || code === 'ENOTDIR') throw vaultError('ENOENT', p, `${p} does not exist`)
    if (code === 'EISDIR') throw vaultError('EISDIR', p, `${p} is a directory`)
    throw error
  }
}

export class FsVault extends Service {
  readonly dir: string
  /** Calls per method, for coalescing assertions. */
  readonly calls: Record<string, VaultPath[]> = { list: [], read: [] }

  constructor(ctx: Context, config: FsVaultConfig) {
    super(ctx, 'vault')
    this.dir = config.root
  }

  async list(dir: VaultPath = '', options: ListOptions = {}): Promise<FileEntry[]> {
    this.calls.list!.push(dir)
    const dirents = await run(this.dir, dir, (abs) => fs.readdir(abs, { withFileTypes: true }))
    const entries: FileEntry[] = []
    for (const dirent of dirents) {
      if (!options.includeHidden && dirent.name.startsWith('.')) continue
      const stat = await fs.stat(path.join(resolveInside(this.dir, dir), dirent.name)).catch(() => null)
      if (!stat) continue
      entries.push({ path: path.posix.join(dir, dirent.name), name: dirent.name, kind: stat.isDirectory() ? 'dir' : 'file', size: stat.size, mtimeMs: stat.mtimeMs })
    }
    return entries
  }

  async read(p: VaultPath): Promise<FileContent> {
    this.calls.read!.push(p)
    const [content, stat] = await run(this.dir, p, async (abs) => [await fs.readFile(abs, 'utf8'), await fs.stat(abs)] as const)
    return { path: p, content, hash: `sha256-${createHash('sha256').update(content).digest('hex')}`, mtimeMs: stat.mtimeMs }
  }

  async exists(p: VaultPath): Promise<boolean> {
    return (await this.stat(p)) !== null
  }

  async stat(p: VaultPath): Promise<FileEntry | null> {
    try {
      const stat = await run(this.dir, p, (abs) => fs.stat(abs))
      return { path: p, name: path.posix.basename(p), kind: stat.isDirectory() ? 'dir' : 'file', size: stat.size, mtimeMs: stat.mtimeMs }
    } catch (error) {
      if ((error as { code?: string }).code === 'ENOENT') return null
      throw error
    }
  }
}
