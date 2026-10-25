// `sha256-<hex>` content hash over the raw bytes (contract inherited from
// Noteriv's guarded writes). Text is hashed as its UTF-8 encoding, so the hash
// of `write(path, text)` equals the hash of reading those bytes back.
import { createHash } from 'node:crypto'
import type { ContentHash } from '@diabase/protocol'

export function hashContent(data: string | Uint8Array): ContentHash {
  return `sha256-${createHash('sha256').update(data).digest('hex')}`
}
