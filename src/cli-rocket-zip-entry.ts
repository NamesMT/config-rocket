#!/usr/bin/env node

import { readFile, writeFile } from 'node:fs/promises'
import { defineCommand, runMain } from 'citty'
import { consola } from 'consola'
import { zip } from 'fflate'
import { glob } from 'tinyglobby'
import { logger } from './helpers/logger'

async function readAndZipFiles(filesList: string[]) {
  // Note: will see if we should use streaming API or not, for now, we specifically targets `config-rocket` users which should be small files and streaming is not yet necessary.
  const filesListWithData: Record<string, Uint8Array> = {}
  // Note: using this approach to read all files at once.
  await Promise.all(filesList.map(async (filePath) => {
    const fileContent = await readFile(filePath)
    filesListWithData[filePath] = fileContent
  }))

  await new Promise<void>((resolve, reject) => {
    zip(
      filesListWithData,
      {
        consume: true,
      },
      async (err, data) => {
        if (err)
          return reject(err)

        await writeFile('rocket-archive.zip', data)
        resolve()
      },
    )
  })
}

const main = defineCommand({
  meta: {
    name: 'config-rocket/rocket-zip',
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
  },
  async run({ args }) {
    // Note: `citty` supports any args to might be an array if multiple are passed but currently `citty` types does not have info about it, so we're using the following to always cast it to array anyway.
    // Also using filter to remove possible bad values like null, undefined, empty string.
    const includesArr = Array.isArray(args.include) ? args.include : [args.include].filter(Boolean)
    const excludesArr = Array.isArray(args.exclude) ? args.exclude : [args.exclude].filter(Boolean)

    const filesList = await glob(includesArr, { ignore: excludesArr })

    if (!filesList.length)
      return logger.error('No files found to zip.')

    const confirmed = await consola.prompt(
      `Found ${filesList.length} files, do you want to zip them?: ${filesList.join(', ')}`,
      { type: 'confirm', cancel: 'null' },
    )

    if (!confirmed)
      return logger.error('User aborted zipping.')

    logger.start('Zipping files...')
    await readAndZipFiles(filesList)
    logger.success('Zipped successfully: rocket-archive.zip')
  },
})

runMain(main)
