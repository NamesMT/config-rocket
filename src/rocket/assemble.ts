import type { Hooks } from 'hookable'
import { readFile } from 'node:fs/promises'
import { replaceMap } from '@namesmt/utils'
import { Hookable } from 'hookable'
import { resolve } from 'pathe'
import { glob } from 'tinyglobby'
import simpleWriteFileWithDirs from '~/helpers/fs/simpleWriteFileWithDirs'
import { logger } from '~/helpers/logger'
import { parseRocketConfig, supplyFuel } from './config'

interface RocketAssembleHooks extends Hooks {
  onFrameFile: (args: {
    filePath: string
    setFilePath: (newFilePath: string) => void
    skipFile: () => void
  }) => void | Promise<void>
}

export default class RocketAssembleHookable extends Hookable<RocketAssembleHooks> {
  constructor() {
    super()
  }
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
   * A hookable instance to hook into the rocket assemble process.
   */
  assembleHookable?: RocketAssembleHookable
}
export async function simpleRocketAssemble(options: SimpleRocketAssembleOptions) {
  const {
    frameDir,
    variables,
    excludes,
    outDir,
    assembleHookable,
  } = options

  const frameFiles = await glob(resolve(frameDir, '**'), { dot: true, cwd: frameDir })

  for (const filePath of frameFiles) {
    let _filePath = filePath
    function setFilePath(newFilePath: string) {
      _filePath = newFilePath
    }
    let _skipFlag = false
    function skipFile() {
      _skipFlag = true
    }

    if (assembleHookable) {
      assembleHookable.callHook('onFrameFile', { filePath, setFilePath, skipFile })
    }

    if (_skipFlag) {
      logger.debug(`Skipping file: ${_filePath}`)
      continue
    }

    if (excludes[_filePath]) {
      logger.debug(`Skipping excluded file: ${_filePath}`)
      continue
    }

    const fileContent = await readFile(resolve(frameDir, _filePath), { encoding: 'utf8' })
      .then(content => replaceMap(content, variables))

    await simpleWriteFileWithDirs(resolve(outDir, _filePath), fileContent)
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
   * A hookable instance to hook into the rocket assemble process.
   */
  assembleHookable?: RocketAssembleHookable
}
export async function rocketAssemble(options: RocketAssembleOptions) {
  const {
    frameDir,
    rocketConfig,
    fuelDir,
    outDir,
    assembleHookable,
  } = options

  const rocketConfigPath = rocketConfig ?? resolve(frameDir, '../rocket.config')

  const { resolvedVariables, resolvedExcludes } = await parseRocketConfig(rocketConfigPath)

  const fueledVariables = await supplyFuel(resolvedVariables, fuelDir)

  await simpleRocketAssemble({
    frameDir,
    variables: fueledVariables,
    excludes: resolvedExcludes,
    outDir,
    assembleHookable,
  })
}
