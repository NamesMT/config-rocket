import type { BinaryToTextEncoding } from 'node:crypto'
import { createHash } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { clearUndefined } from '@namesmt/utils'
import { defineCommand } from 'citty'

export const hashCommand = defineCommand({
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

    const result = {
      input,
      algorithm,
      outputFormat,
      error: undefined as string | undefined,
      output: undefined as string | undefined,
    }

    try {
      const fileBuffer = await readFile(input)

      const hasher = createHash(algorithm)
      hasher.update(fileBuffer)
      result.output = hasher.digest(outputFormat as BinaryToTextEncoding)
    }
    catch (e) {
      result.error = (e instanceof Error) ? e.message : String(e)
    }

    clearUndefined(result)

    console.log(result)
  },
})
