import type { FlateError, Unzipped } from 'fflate'
import type { Hookable, Hooks } from 'hookable'
import type { RocketAssembleHooks } from '~/rocket/assemble'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import { strFromU8, unzip } from 'fflate'
import { fileOutput } from '~/helpers/fs'
import { logger } from '~/helpers/logger'
import { rocketAssemble } from '~/rocket/assemble'

export interface RocketUnpackHooks extends Hooks {
  onExtract: (args: {
    err: FlateError | null
    unzipped: Unzipped
  }) => void | Promise<void>
}

export interface UnpackOptions {
  /**
   * A hookable instance to hook into the rocket unpack (and related) process.
   */
  hookable?: Hookable<RocketUnpackHooks & RocketAssembleHooks>
}

export async function unpackFromUrl(url: string, options?: UnpackOptions) {
  const {
    hookable,
  } = options ?? {}

  logger.info(`Downloading config pack from ${url}`)

  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`Failed to download config pack from ${url}`)

  const configPackBuffer = new Uint8Array(await res.arrayBuffer())

  logger.start('Extracting config pack to `.tmp`...')
  await new Promise<void>((resolvePromise, rejectPromise) => {
    unzip(configPackBuffer, async (err, unzipped) => {
      if (err)
        return rejectPromise(new Error('Failed to extract the config pack.'))

      if (hookable)
        hookable.callHook('onExtract', { err, unzipped })

      if (!unzipped['rocket.config.json5'])
        return rejectPromise(new Error('Invalid config pack: "rocket.config.json5" not found.'))

      for (const [key, value] of Object.entries(unzipped))
        await fileOutput(join('.tmp', key), strFromU8(value))

      resolvePromise()
    })
  })
  logger.success('Extracted successfully.')

  logger.start('Assembling the config according to `rocketConfig`...')
  await rocketAssemble({
    frameDir: join('.tmp', 'frame'),
    fuelDir: join('.tmp', 'fuel'),
    outDir: '.',
    hookable,
  })
  logger.start('Assembled successfully, removing temporary files...')
  await rm('.tmp', { recursive: true })
  logger.success('All done, enjoy your new config!')
}
