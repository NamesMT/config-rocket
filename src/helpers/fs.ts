import type { Hookable, Hooks } from 'hookable'
import type { ReactiveArgs } from '~/types'
import { Buffer } from 'node:buffer'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { defu } from 'defu'
import { dirname, extname } from 'pathe'
import { parse as yamlParse, stringify as yamlStringify } from 'yaml'
import { logger } from './logger'

export type FileOutputState = ReactiveArgs<{
  filePath: string
  data: string
  /**
   * This property is auto-populated for deep merge-able files (json, yaml) in hooks like `onFileOutputDeepMerge`, the user can also set it manually on prior hooks.
   */
  parsedData?: Record<string, unknown> | undefined
  mergeResult?: string | undefined
  mergeType: 'json' | 'yaml' | 'concat' | 'custom'
  isValidFileToMerge: boolean
  /**
   * A custom id for the file, used for advanced hook usecase like `custom` merge
   */
  fid?: string
}>

export interface FileOutputHooks extends Hooks {
  onFileOutput: (state: FileOutputState) => void | Promise<void>

  onFileOutputCustomMerge: (state: FileOutputState) => void | Promise<void>

  onFileOutputConcatMerge: (state: FileOutputState) => void | Promise<void>

  onFileOutputDeepMerge: (state: FileOutputState) => void | Promise<void>

  onFileOutputJsonMerge: (state: FileOutputState) => void | Promise<void>

  onFileOutputYamlMerge: (state: FileOutputState) => void | Promise<void>
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
   * + `'deep'`: perform deep merge supported files only (json, yaml).
   * + `true`: concatenate data of all files (json are still deep-merged).
   *
   */
  mergeContent?: boolean | 'deep'
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

  const mergeType = _fileMergeType(filePath)
  const state: FileOutputState = {
    filePath,
    data,
    mergeType,
    isValidFileToMerge: mergeContent === true || (mergeContent === 'deep' && mergeType !== 'concat'),
  }

  if (hookable)
    await hookable.callHook('onFileOutput', state)

  // Optimistically create the directory
  await mkdir(dirname(state.filePath), { recursive: true })

  const checkFileExists = () => access(state.filePath).then(() => true).catch(() => false)
  if (state.isValidFileToMerge && await checkFileExists()) {
    logger.info(`Merging file "${state.filePath}"...`)

    switch (state.mergeType) {
      case 'custom': {
        if (!hookable)
          throw new Error('Expect `hookable` to be provided when mergeType is "custom"')

        await hookable.callHook('onFileOutputCustomMerge', state)

        if (!state.mergeResult)
          throw new Error('Expect `mergeResult` to be provided when mergeType is "custom"')

        state.data = state.mergeResult
        break
      }
      case 'concat': {
        if (hookable)
          await hookable.callHook('onFileOutputConcatMerge', state)

        state.data = state.mergeResult ?? Buffer.concat([await readFile(state.filePath), Buffer.from(state.data)]).toString()
        break
      }
      case 'json': {
        if (typeof state.data !== 'string')
          throw new Error('Please provide `data` as a JSON stringified object')

        state.parsedData = JSON.parse(state.data)

        if (hookable) {
          await hookable.callHook('onFileOutputDeepMerge', state)
          await hookable.callHook('onFileOutputJsonMerge', state)
        }

        state.data = state.mergeResult ?? JSON.stringify(
          defu(state.parsedData, JSON.parse(await readFile(state.filePath, 'utf-8'))),
          undefined,
          2,
        )
        break
      }
      case 'yaml': {
        if (typeof state.data !== 'string')
          throw new Error('Please provide `data` as a YAML stringified object')

        state.parsedData = yamlParse(state.data)

        if (hookable) {
          await hookable.callHook('onFileOutputDeepMerge', state)
          await hookable.callHook('onFileOutputYamlMerge', state)
        }

        state.data = state.mergeResult ?? yamlStringify(
          defu(state.parsedData, yamlParse(await readFile(state.filePath, 'utf-8'))),
          undefined,
          2,
        )
        break
      }
      default:
        throw new Error(`Unexpected merge type: ${state.mergeType}`)
    }
  }

  // Write the file
  return await writeFile(state.filePath, state.data)
}

function _fileMergeType(filePath: string) {
  const extension = extname(filePath)

  switch (extension) {
    case '.json':
      return 'json'
    case '.yaml':
    case '.yml':
      return 'yaml'
    default:
      return 'concat'
  }
}
