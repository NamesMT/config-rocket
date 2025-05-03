import type { Unzipped } from 'fflate'
import type { Hookable, Hooks } from 'hookable'
import type { FileOutputHooks } from '~/helpers/fs'
import type { RocketAssembleHooks } from '~/rocket/assemble'
import type { ParseRocketConfigHooks } from '~/rocket/config'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { consola } from 'consola'
import { strFromU8 } from 'fflate'
import { join, resolve } from 'pathe'
import { unzipAsync } from '~/helpers/binary'
import { assertsBinarySha256 } from '~/helpers/crypto'
import { fileOutput } from '~/helpers/fs'
import { logger } from '~/helpers/logger'
import { rocketAssemble } from '~/rocket/assemble'

export interface RocketUnpackHooks extends Hooks {
  onExtract: (props: {
    unzipped: Unzipped
  }) => void | Promise<void>
}

export interface UnpackOptions {
  /**
   * A hookable instance to hook into the rocket unpack (and related) process.
   */
  hookable?: Hookable<RocketUnpackHooks & RocketAssembleHooks & ParseRocketConfigHooks & FileOutputHooks>

  /**
   * Control the behavior when the downloaded archive is not a rocket config pack.
   * + `true`: Continue extract anyway.
   * + `false`: Will abort the process.
   * + `'prompt'`: The user will be prompted to continue or abort.
   *
   * @default 'prompt'
   */
  nonAssemblyBehavior?: 'prompt' | true | false

  /**
   * If specified, will verify the downloaded archive's sha256 hash (base64url)
   */
  sha256?: string

  cwd?: string
}

export async function unpackFromUint8(uint8: Uint8Array, options?: UnpackOptions) {
  const {
    hookable,
    nonAssemblyBehavior = 'prompt',
    sha256,
    cwd = resolve(),
  } = options ?? {}

  const configPackBuffer = uint8

  if (sha256)
    await assertsBinarySha256(configPackBuffer, sha256)

  logger.start('Extracting archive...')
  let isRocketAssembly = true
  let nonAssemblyContinue = typeof nonAssemblyBehavior === 'boolean' ? nonAssemblyBehavior : null
  const tmpDir = await mkdtemp(join(tmpdir(), 'config-rocket-'))
    // If for some reason we don't have permission to write to os temp dir, fallback to cwd
    .catch(() => mkdtemp(join(cwd, '.tmp-config-rocket-')))
  try {
    const unzipped = await unzipAsync(configPackBuffer)
      .catch(() => { throw new Error('Failed to extract the archive.') })

    if (hookable)
      await hookable.callHook('onExtract', { unzipped })

    if (!unzipped['rocket.config.json5']) {
      isRocketAssembly = false

      if (typeof nonAssemblyContinue !== 'boolean' && nonAssemblyBehavior === 'prompt') {
        nonAssemblyContinue = await consola.prompt(
          'Archive is not a valid rocket config pack, do you want to continue extract anyway?',
          { type: 'confirm', cancel: 'null' },
        )
      }

      if (!nonAssemblyContinue)
        throw new Error('Invalid config pack: "rocket.config.json5" not found.')
    }

    for (const [key, value] of Object.entries(unzipped)) {
      await fileOutput(
        isRocketAssembly ? join(tmpDir, key) : join(cwd, key),
        strFromU8(value),
        { hookable },
      )
    }
    logger.success('Extracted successfully.')

    if (isRocketAssembly) {
      logger.start('Assembling the config according to `rocketConfig`...')
      await rocketAssemble({
        frameDir: join(tmpDir, 'frame'),
        fuelDir: join(tmpDir, 'fuel'),
        outDir: cwd,
        hookable,
      })
      logger.success('Assembled successfully, enjoy your new configs!')
    }
  }
  finally {
    await rm(tmpDir, { recursive: true })
      .catch(() => { throw new Error('Failed to remove tmpDir') })
  }
}

export async function unpackFromUrl(url: string, options?: UnpackOptions) {
  logger.info(`Downloading archive from ${url}`)

  const res = await fetch(url)
  if (!res.ok)
    throw new Error(`Failed to download archive from ${url}`)

  return unpackFromUint8(new Uint8Array(await res.arrayBuffer()), options)
}
