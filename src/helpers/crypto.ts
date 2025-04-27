import type { BinaryLike } from 'node:crypto'
import { createHash } from 'node:crypto'

export async function createSha256(data: BinaryLike) {
  const sha256 = createHash('sha256')
  sha256.update(data)
  return sha256.digest('base64url')
}
