import { writeFile } from 'node:fs/promises'
import { defineCommand } from 'citty'
import { consola } from 'consola'
import { glob } from 'tinyglobby'
import { createSha256, readAndZipFiles } from '~/cli'
import { logger } from '~/helpers/logger'

export default defineCommand({
  meta: {
    name: 'zip',
    description: 'Simple utility to help you zip anything.',
  },
  args: {
    include: {
      alias: ['i'],
      type: 'string',
      description: 'Glob pattern to include files',
      required: true,
      valueHint: 'files/*.md',
    },
    exclude: {
      alias: ['x'],
      type: 'string',
      description: 'Glob pattern to exclude files',
      valueHint: '.env*',
    },
    output: {
      alias: ['o'],
      type: 'string',
      description: 'The output file path',
      valueHint: 'rocket-archive.zip',
      default: 'rocket-archive.zip',
    },
    force: {
      alias: ['f'],
      type: 'boolean',
      description: 'Run the command without prompting',
    },
  },
  async run({ args }) {
    const {
      include,
      exclude,
      output,
      force,
    } = args

    // Note: `citty` supports any args to might be an array if multiple are passed but currently `citty` types does not have info about it, so we're using the following to always cast it to array anyway.
    // Also using filter to remove possible bad values like null, undefined, empty string.
    const includesArr = Array.isArray(include) ? include : [include].filter(Boolean)
    const excludesArr = Array.isArray(exclude) ? exclude : [exclude].filter(Boolean)

    const filesList = await glob(
      includesArr,
      {
        ignore: excludesArr,
        dot: true,
      },
    )

    if (!filesList.length)
      throw new Error('No files found to zip.')

    const confirmed = force
      ? true
      : await consola.prompt(
        `Found ${filesList.length} files, do you want to zip them?: ${filesList.join(', ')}`,
        { type: 'confirm', cancel: 'null' },
      )

    if (!confirmed)
      return logger.warn('User aborted zipping.')

    logger.start('Zipping files...')
    const uint8 = await readAndZipFiles(filesList)
    await writeFile(output, uint8)
    const sha256 = await createSha256(uint8)
    logger.success(`Zipped successfully: ${output}, sha256: ${sha256}`)
  },
})
