// Minimal in-memory `ctx.vault` for bundler tests: a Cordis service named `vault` over a mutable
// `Record<path, content>`. Errors are VaultError-shaped, like the real vault's.
import { Context, Service } from '@diabase/kernel'
import type {
  FileContent,
  FileEntry,
  ListOptions,
  VaultErrorCode,
  VaultErrorShape,
  VaultInfo,
} from '@diabase/protocol'

export interface FakeVaultState {
  /** Vault-relative POSIX path -> content. Mutate between builds to change the vault. */
  files: Record<string, string | Uint8Array>
  /** Delay (ms) before every `list` / `read` / `readBinary` resolves. Mutable. */
  delayMs?: number
  /** Throw plain `{ name, code, path, message }` objects instead of `Error`s (as the IPC bridge delivers them). */
  plainErrors?: boolean
  /** Makes a call fail with this VaultError code. Keys look like `list:<dir>` or `read:<path>`. */
  fail?: Record<string, VaultErrorCode>
  /** Calls seen, in order, e.g. `read:a/b.ts`. */
  calls?: string[]
}

export function vaultError(code: VaultErrorCode, path: string, plain = false): VaultErrorShape | Error {
  const message = `${code}: ${path}`
  const shape: VaultErrorShape = { name: 'VaultError', code, path, message }
  return plain ? shape : Object.assign(new Error(message), shape)
}

const sleep = (ms: number) => new Promise<void>((resolve) => setTimeout(resolve, ms))

export class FakeVault extends Service {
  constructor(
    ctx: Context,
    private readonly state: FakeVaultState,
  ) {
    super(ctx, 'vault')
    state.calls ??= []
  }

  private async pause(call: string): Promise<void> {
    this.state.calls!.push(call)
    if (this.state.delayMs) await sleep(this.state.delayMs)
    const code = this.state.fail?.[call]
    if (code) this.fail(code, call.slice(call.indexOf(':') + 1))
  }

  private fail(code: VaultErrorCode, path: string): never {
    throw vaultError(code, path, this.state.plainErrors)
  }

  private isDir(path: string): boolean {
    const prefix = path === '' ? '' : `${path}/`
    return Object.keys(this.state.files).some((p) => p.startsWith(prefix))
  }

  async info(): Promise<VaultInfo> {
    return { id: 'fake', name: 'fake' }
  }

  async list(dir = '', options: ListOptions = {}): Promise<FileEntry[]> {
    await this.pause(`list:${dir}`)
    if (dir !== '' && Object.hasOwn(this.state.files, dir)) this.fail('ENOTDIR', dir)
    if (!this.isDir(dir)) this.fail('ENOENT', dir)
    const prefix = dir === '' ? '' : `${dir}/`
    const out = new Map<string, FileEntry>()
    for (const [path, content] of Object.entries(this.state.files)) {
      if (!path.startsWith(prefix)) continue
      const rel = path.slice(prefix.length)
      const segments = rel.split('/')
      if (!options.includeHidden && segments.some((s) => s.startsWith('.'))) continue
      const depth = options.recursive ? segments.length : 1
      for (let i = 1; i <= depth && i <= segments.length; i++) {
        const isFile = i === segments.length
        const entryPath = prefix + segments.slice(0, i).join('/')
        if (out.has(entryPath)) continue
        out.set(entryPath, {
          path: entryPath,
          name: segments[i - 1]!,
          kind: isFile ? 'file' : 'dir',
          ...(isFile ? { size: typeof content === 'string' ? Buffer.byteLength(content) : content.byteLength } : {}),
        })
      }
    }
    const entries = [...out.values()]
    return options.extensions
      ? entries.filter((e) => e.kind === 'dir' || options.extensions!.some((x) => e.name.endsWith(x)))
      : entries
  }

  async exists(path: string): Promise<boolean> {
    return Object.hasOwn(this.state.files, path) || this.isDir(path)
  }

  async stat(path: string): Promise<FileEntry | null> {
    const content = this.state.files[path]
    if (content === undefined) return this.isDir(path) ? { path, name: path.split('/').pop()!, kind: 'dir' } : null
    return { path, name: path.split('/').pop()!, kind: 'file', size: Buffer.byteLength(content) }
  }

  async read(path: string): Promise<FileContent> {
    await this.pause(`read:${path}`)
    const content = this.state.files[path]
    if (content === undefined) this.fail(this.isDir(path) ? 'EISDIR' : 'ENOENT', path)
    const text = typeof content === 'string' ? content : Buffer.from(content).toString('utf8')
    return { path, content: text, hash: 'sha256-fake', mtimeMs: 0 }
  }

  async readBinary(path: string): Promise<Uint8Array> {
    await this.pause(`readBinary:${path}`)
    const content = this.state.files[path]
    if (content === undefined) this.fail(this.isDir(path) ? 'EISDIR' : 'ENOENT', path)
    return typeof content === 'string' ? new TextEncoder().encode(content) : content
  }
}
