import type { Hookable, Hooks } from 'hookable'
import type { ReactiveArgs } from '~/types'
import { Buffer } from 'node:buffer'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { defu } from 'defu'
import { dirname } from 'pathe'
import { logger } from './logger'

export interface FileOutputHooks extends Hooks {
  onFileOutput: (args: ReactiveArgs<{
    filePath: string
    data: string
  }>) => void | Promise<void>

  onFileOutputJsonMerge: (args: ReactiveArgs<{
    filePath: string
    data: string
    result?: string
  }>) => void | Promise<void>

  onFileOutputOtherMerge: (args: ReactiveArgs<{
    filePath: string
    data: string
    result?: string
  }>) => void | Promise<void>
}

export interface FileOutputOptions {
  /**
   * A hookable instance to hook into the file output process.
   */
  hookable?: Hookable<FileOutputHooks>

  /**
   * Control existing file content merging policy.
   *
   * Options:
   * + `json`: perform deep merge for json files only.
   * + `true`: concatenate data of all files (json are still deep-merged).
   *
   */
  mergeContent?: boolean | 'json'
}

/**
 * Utility to help write a file, with hooks, merging and additional goodies
 *
 * @param filePath The file path to write to
 * @param data The data to write
 * @param options {@link FileOutputOptions}
 */
export async function fileOutput(filePath: string, data: string, options?: FileOutputOptions) {
  const {
    hookable,
    mergeContent,
  } = options ?? {}

  const state = {
    filePath,
    data,
  }

  if (hookable)
    await hookable.callHook('onFileOutput', state)

  // Optimistically create the directory
  await mkdir(dirname(state.filePath), { recursive: true })

  const checkFileExists = () => access(state.filePath).then(() => true).catch(() => false)
  if (mergeContent && await checkFileExists()) {
    logger.info(`Merging file "${state.filePath}"...`)

    const mergeState = {
      get filePath() { return state.filePath },
      set filePath(value) { state.filePath = value },
      get data() { return state.data },
      set data(value) { state.data = value },
      result: undefined as undefined | string,
    }

    // special deep merger for json
    if (state.filePath.endsWith('.json')) {
      if (typeof state.data !== 'string')
        throw new Error('Please provide `data` as a JSON stringified object')

      if (hookable)
        await hookable.callHook('onFileOutputJsonMerge', mergeState)

      state.data = mergeState.result ?? JSON.stringify(
        defu(JSON.parse(state.data), JSON.parse(await readFile(state.filePath, 'utf-8'))),
        undefined,
        2,
      )
    }
    // simple concat for other files
    else if (mergeContent === true) {
      if (hookable)
        await hookable.callHook('onFileOutputOtherMerge', mergeState)

      state.data = mergeState.result ?? Buffer.concat([await readFile(state.filePath), Buffer.from(state.data)]).toString()
    }
  }

  // Write the file
  return await writeFile(state.filePath, state.data)
}
