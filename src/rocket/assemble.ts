import type { Hookable, Hooks } from 'hookable'
import type { FileOutputHooks } from '~/helpers/fs'
import type { ReactiveArgs } from '~/types'
import { readFile } from 'node:fs/promises'
import { replaceMap } from '@namesmt/utils'
import { resolve } from 'pathe'
import { glob } from 'tinyglobby'
import { fileOutput } from '~/helpers/fs'
import { logger } from '~/helpers/logger'
import { parseRocketConfig, supplyFuel } from './config'

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
  frameDir: string

  /**
   * The variables map to put into the frame.
   */
  variables: Record<string, string>

  /**
   * The excludes map to skip files from the frame.
   */
  excludes: Record<string, boolean>

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
    variables,
    excludes,
    outDir,
    hookable,
  } = options

  const frameFiles = await glob(resolve(frameDir, '**'), { dot: true, cwd: frameDir })

  // process frame files
  for (const filePath of frameFiles) {
    let _skipFlag: string | undefined
    function skipFile(reason?: string) {
      _skipFlag = _skipFlag ?? reason
    }

    let _filePath = filePath
    const args = {
      get filePath() { return _filePath },
      set filePath(value) { _filePath = value },
      skipFile,
    }

    if (hookable) {
      await hookable.callHook('onFrameFile', args)
    }

    if (_skipFlag) {
      logger.debug(`Skipping file "${_filePath}", reason: ${_skipFlag}`)
      continue
    }

    if (excludes[_filePath]) {
      logger.debug(`Skipping excluded file: ${_filePath}`)
      continue
    }

    const fileContent = await readFile(resolve(frameDir, filePath), { encoding: 'utf8' })
      .then(content => replaceMap(content, variables))

    await fileOutput(resolve(outDir, _filePath), fileContent, { hookable, mergeContent: 'json' })
  }
}

export interface RocketAssembleOptions {
  /**
   * Path to the rocket frame directory.
   */
  frameDir: string

  /**
   * Path to the rocket config file.
   *
   * @default `rocket.config.ts` in parent of `frameDir`.
   */
  rocketConfig?: string

  /**
   * Path to the rocket fuel directory.
   */
  fuelDir: string

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
  hookable?: Hookable<RocketAssembleHooks & FileOutputHooks>
}
export async function rocketAssemble(options: RocketAssembleOptions) {
  const {
    frameDir,
    rocketConfig,
    fuelDir,
    outDir,
    hookable,
  } = options

  const rocketConfigPath = rocketConfig ?? resolve(frameDir, '../rocket.config')

  const { resolvedVariables, resolvedExcludes } = await parseRocketConfig(rocketConfigPath)

  const fueledVariables = await supplyFuel(resolvedVariables, fuelDir)

  await simpleRocketAssemble({
    frameDir,
    variables: fueledVariables,
    excludes: resolvedExcludes,
    outDir,
    hookable,
  })
}
