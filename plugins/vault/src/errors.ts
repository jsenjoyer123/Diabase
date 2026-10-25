// Vault errors. Thrown as `Error` instances in main (stack traces), but every
// field the renderer needs is an own enumerable property, so the kernel bridge
// can forward `{ name, code, path, message }` as plain data.
import type { VaultErrorCode, VaultErrorShape, VaultPath } from '@diabase/protocol'

export class VaultError extends Error implements VaultErrorShape {
  override readonly name = 'VaultError' as const

  constructor(
    readonly code: VaultErrorCode,
    readonly path: VaultPath,
    message?: string,
  ) {
    super(message ?? `${code}: ${path || '<vault root>'}`)
  }

  toJSON(): VaultErrorShape {
    return { name: this.name, code: this.code, path: this.path, message: this.message }
  }
}

/** True for `VaultError` instances and for their plain-data shape after crossing IPC. */
export function isVaultError(value: unknown, code?: VaultErrorCode): value is VaultErrorShape {
  if (typeof value !== 'object' || value === null) return false
  const v = value as Partial<VaultErrorShape>
  return v.name === 'VaultError' && typeof v.code === 'string' && (code === undefined || v.code === code)
}
