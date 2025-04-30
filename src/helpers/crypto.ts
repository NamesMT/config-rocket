import type { BinaryLike } from 'node:crypto'
import { createHash } from 'node:crypto'

export async function createSha256(data: BinaryLike) {
  const sha256 = createHash('sha256')
  sha256.update(data)
  return sha256.digest('base64url')
}

export async function assertsBinarySha256(data: BinaryLike, sha256: string) {
  const binarySha256 = await createSha256(data)
  if (binarySha256 !== sha256)
    throw new Error(`The binary's sha256 is invalid, expected: ${sha256}, got: ${binarySha256}`)
}
