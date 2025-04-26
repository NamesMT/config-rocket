import type { Hookable, Hooks } from 'hookable'
import type { ReactiveArgs } from '~/types'
import { Buffer } from 'node:buffer'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { defu } from 'defu'
import { dirname } from 'pathe'
import { logger } from './logger'

export type FileOutputState = ReactiveArgs<{
  filePath: string
  data: string
  result: undefined | string
  mergeType: 'json' | 'concat'
  isValidFileToMerge: boolean
}>

export interface FileOutputHooks extends Hooks {
  onFileOutput: (state: FileOutputState) => void | Promise<void>

  onFileOutputJsonMerge: (state: FileOutputState) => void | Promise<void>

  onFileOutputOtherMerge: (state: FileOutputState) => void | Promise<void>
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

  const state: FileOutputState = {
    filePath,
    data,
    result: undefined as undefined | string,
    mergeType: filePath.endsWith('.json') ? 'json' : 'concat',
    isValidFileToMerge: mergeContent === true || (mergeContent === 'json' && filePath.endsWith('.json')),
  }

  if (hookable)
    await hookable.callHook('onFileOutput', state)

  // Optimistically create the directory
  await mkdir(dirname(state.filePath), { recursive: true })

  const checkFileExists = () => access(state.filePath).then(() => true).catch(() => false)
  if (state.isValidFileToMerge && await checkFileExists()) {
    logger.info(`Merging file "${state.filePath}"...`)

    switch (state.mergeType) {
      case 'json': {
        if (typeof state.data !== 'string')
          throw new Error('Please provide `data` as a JSON stringified object')

        if (hookable)
          await hookable.callHook('onFileOutputJsonMerge', state)

        state.data = state.result ?? JSON.stringify(
          defu(JSON.parse(state.data), JSON.parse(await readFile(state.filePath, 'utf-8'))),
          undefined,
          2,
        )
        break
      }
      case 'concat': {
        if (hookable)
          await hookable.callHook('onFileOutputOtherMerge', state)

        state.data = state.result ?? Buffer.concat([await readFile(state.filePath), Buffer.from(state.data)]).toString()
        break
      }
      default:
        throw new Error(`Unexpected merge type: ${state.mergeType}`)
    }
  }

  // Write the file
  return await writeFile(state.filePath, state.data)
}
