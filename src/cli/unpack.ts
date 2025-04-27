import type { FlateError, Unzipped } from 'fflate'
import type { Hookable, Hooks } from 'hookable'
import type { FileOutputHooks } from '~/helpers/fs'
import type { RocketAssembleHooks } from '~/rocket/assemble'
import { rm } from 'node:fs/promises'
import { join } from 'node:path'
import consola from 'consola'
import { strFromU8, unzip } from 'fflate'
import { createSha256 } from '~/helpers/crypto'
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
  hookable?: Hookable<RocketUnpackHooks & RocketAssembleHooks & FileOutputHooks>

  /**
   * Control the behavior when the downloaded archive is not a rocket config pack.
   * `true`: Continue extract anyway.
   * `false`: Will abort the process.
   * `prompt`: The user will be prompted to continue or abort.
   *
   * @default 'prompt'
   */
  nonAssemblyBehavior?: 'prompt' | true | false

  /**
   * If specified, will verify the downloaded archive's sha256 hash (base64url)
   */
  sha256?: string
}

export async function unpackFromUrl(url: string, options?: UnpackOptions) {
  const {
    hookable,
    nonAssemblyBehavior = 'prompt',
    sha256,
  } = options ?? {}

  logger.info(`Downloading archive from ${url}`)

  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`Failed to download archive from ${url}`)

  const configPackBuffer = new Uint8Array(await res.arrayBuffer())

  if (sha256) {
    const configPackSha256 = await createSha256(configPackBuffer)
    if (configPackSha256 !== sha256)
      throw new Error(`The downloaded archive's sha256 is invalid, expected: ${sha256}, got: ${configPackSha256}`)
  }

  logger.start('Extracting archive (to `.tmp` if needed)...')
  let isRocketAssembly = true
  let nonAssemblyContinue = typeof nonAssemblyBehavior === 'boolean' ? nonAssemblyBehavior : null
  await new Promise<void>((resolvePromise, rejectPromise) => {
    unzip(configPackBuffer, async (err, unzipped) => {
      if (err)
        return rejectPromise(new Error('Failed to extract the archive.'))

      if (hookable)
        hookable.callHook('onExtract', { err, unzipped })

      if (!unzipped['rocket.config.json5']) {
        isRocketAssembly = false

        if (typeof nonAssemblyContinue !== 'boolean' && nonAssemblyBehavior === 'prompt') {
          nonAssemblyContinue = await consola.prompt(
            'Archive is not a valid rocket config pack, do you want to continue extract anyway?',
            { type: 'confirm', cancel: 'null' },
          )
        }

        if (!nonAssemblyContinue)
          return rejectPromise(new Error('Invalid config pack: "rocket.config.json5" not found.'))
      }

      for (const [key, value] of Object.entries(unzipped)) {
        await fileOutput(
          isRocketAssembly ? join('.tmp', key) : key,
          strFromU8(value),
          { hookable },
        )
      }

      resolvePromise()
    })
  })
  logger.success('Extracted successfully.')

  if (isRocketAssembly) {
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
}
