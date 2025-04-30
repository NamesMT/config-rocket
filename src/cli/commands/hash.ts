import type { BinaryToTextEncoding } from 'node:crypto'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { defineCommand } from 'citty'
import { logger } from '~/helpers/logger'

export default defineCommand({
  meta: {
    name: 'hash',
    description: 'Simple utility to help you get the hash of a file.',
  },
  args: {
    input: {
      type: 'positional',
      description: 'The input file path',
      required: true,
      valueHint: 'rocket-archive.zip',
    },
    algorithm: {
      alias: ['a'],
      type: 'string',
      description: 'The hash algorithm',
      valueHint: 'sha256',
      default: 'sha256',
    },
    outputFormat: {
      alias: ['o'],
      type: 'string',
      description: 'The output format',
      valueHint: 'base64url',
      default: 'base64url',
    },
  },
  async run({ args }) {
    const {
      input,
      algorithm,
      outputFormat,
    } = args

    console.log({ input, algorithm, outputFormat })

    const fileBuffer = await readFile(input)

    const hasher = createHash(algorithm)
    hasher.update(fileBuffer)
    const output = hasher.digest(outputFormat as BinaryToTextEncoding)

    logger.success('Hashed successfully, capture next line:')
    console.log(output)
  },
})
