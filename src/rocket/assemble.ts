import type { Hookable, Hooks } from 'hookable'
import type { ParseRocketConfigHooks } from './config'
import type { FileOutputHooks } from '~/helpers/fs'
import type { ReactiveArgs } from '~/types'
import { readFile } from 'node:fs/promises'
import { replaceMap } from '@namesmt/utils'
import { resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { fileOutput } from '~/helpers/fs'
import { logger } from '~/helpers/logger'
import { parseRocketConfig, supplyFuel, supplyFuelToResolvedFilesBuilder } from './config'

export interface RocketAssembleHooks extends Hooks {
  onFrameFile: (args: ReactiveArgs<{
    filePath: string
  }> & {
    skipFile: (reason?: string) => void
  }) => void | Promise<void>
}

export interface SimpleRocketAssembleOptions {
  /**
   * Path to the rocket frame directory.
   */
  frameDir?: string

  /**
   * The variables map to put into the frame.
   */
  variables?: Record<string, string>

  /**
   * The excludes map to skip files from the frame.
   */
  excludes?: Record<string, boolean>

  /**
   * Files builder map to dynamically build files.
   */
  filesBuilder?: Record<string, { filePath: string, content: string }>

  /**
   * Output directory.
   */
  outDir: string

  /**
   * A hookable instance to hook into the rocket assemble (and related) process.
   */
  hookable?: Hookable<RocketAssembleHooks & FileOutputHooks>
}
export async function simpleRocketAssemble(options: SimpleRocketAssembleOptions) {
  const {
    frameDir,
    variables = {},
    excludes = {},
    filesBuilder = {},
    outDir,
    hookable,
  } = options

  const frameFiles = !frameDir ? [] : await glob(resolve(frameDir, '**'), { dot: true, cwd: frameDir })

  async function processFiles(files: Array<{
    source: 'frame' | 'filesBuilder'
    filePath: string
    key?: string
    content?: string
  }>) {
    for (const file of files) {
      let _skipFlag: string | undefined
      function skipFile(reason?: string) {
        _skipFlag = _skipFlag ?? reason
      }

      let filePath = file.filePath
      const args = {
        get filePath() { return filePath },
        set filePath(value) { filePath = value },
        skipFile,
      }

      if (hookable) {
        await hookable.callHook('onFrameFile', args)
      }

      if (_skipFlag) {
        logger.debug(`Skipping file "${filePath}", reason: ${_skipFlag}`)
        continue
      }

      if (excludes[filePath]) {
        logger.debug(`Skipping excluded file: ${filePath}`)
        continue
      }

      const resolveFileContent = async () => {
        switch (file.source) {
          case 'frame':
            return await readFile(resolve(frameDir!, file.filePath), { encoding: 'utf8' })
          case 'filesBuilder':
            return file.content!
          default:
            throw new Error(`Unexpected file source: ${file.source}`)
        }
      }

      const fileContent = await resolveFileContent()

      let fileContentFinal = fileContent
      let fileContentMirror = ''
      do {
        fileContentMirror = fileContentFinal
        fileContentFinal = replaceMap(fileContentMirror, variables)
      } while (fileContentFinal !== fileContentMirror)

      await fileOutput(resolve(outDir, filePath), fileContentFinal, { hookable, mergeContent: 'json' })
    }
  }

  // process frame files
  await processFiles(frameFiles.map(filePath => ({ source: 'frame', filePath })))

  // process filesBuilder files
  await processFiles(Object.entries(filesBuilder).map(([key, file]) => ({
    source: 'filesBuilder',
    filePath: file.filePath,
    key,
    content: file.content,
  })))
}

export interface RocketAssembleOptions {
  /**
   * Path to the rocket config file.
   *
   * @default `rocket.config.ts` in parent of `frameDir`.
   */
  rocketConfig?: string

  /**
   * Path to the rocket frame directory.
   */
  frameDir?: string

  /**
   * Path to the rocket fuel directory.
   */
  fuelDir?: string

  /**
   * The
   */

  /**
   * Output directory.
   */
  outDir: string

  /**
   * A hookable instance to hook into the rocket assemble (and related) process.
   */
  hookable?: Hookable<RocketAssembleHooks & ParseRocketConfigHooks & FileOutputHooks>
}
export async function rocketAssemble(options: RocketAssembleOptions) {
  const {
    frameDir,
    rocketConfig,
    fuelDir,
    outDir,
    hookable,
  } = options

  const rocketConfigPath = rocketConfig ?? (frameDir && resolve(frameDir, '../rocket.config'))

  if (!rocketConfigPath)
    throw new Error('`rocketConfig` is required when `frameDir` is not specified')

  const { resolvedVariables, resolvedExcludes, resolvedFilesBuilder } = await parseRocketConfig(rocketConfigPath, { hookable })

  await simpleRocketAssemble({
    frameDir,
    filesBuilder: fuelDir ? await supplyFuelToResolvedFilesBuilder(resolvedFilesBuilder, fuelDir) : resolvedFilesBuilder,
    variables: fuelDir ? await supplyFuel(resolvedVariables, fuelDir) : resolvedVariables,
    excludes: resolvedExcludes,
    outDir,
    hookable,
  })
}
