import type { Zippable } from 'fflate'
import type { RocketConfig } from './config'
import { mkdir, readFile, writeFile } from 'node:fs/promises'
import { stringifyJSON5 } from 'confbox'
import { strToU8 } from 'fflate'
import { dirname, join, resolve } from 'pathe'
import { createSha256 } from '~/cli'
import { addDirectoryToZip, zipAsync } from '~/helpers/binary'
import { logger } from '~/helpers/logger'
import { loadRocketConfig } from './config'

export async function extractReferencedFuels(rocketConfig: RocketConfig): Promise<string[]> {
  // Using a regexp string match for now, I'll see the feedbacks if we need to actually traverse the JSON tree.

  const rocketConfigStr = JSON.stringify(rocketConfig)

  // Matches strings like `fuel:path/to/fuel.txt` or `fuel:path/with"quotes".txt` within the stringified config
  const fuelMatches = rocketConfigStr.matchAll(/"fuel:((?:\\"|[^"])*)"/g) // Find "fuel:path" pattern, handling escaped quotes

  return Array.from(fuelMatches, m => m[1]).map(p => p.replace(/\\(.)/g, '$1'))
}

export interface bundleConfigPackOptions {
  /**
   * Path to the rocket frame directory.
   */
  frameDir?: string

  /**
   * Path to the rocket config file.
   *
   * @default `rocket.config.ts` in parent of `frameDir`.
   */
  rocketConfig?: string

  /**
   * Path to the rocket fuel directory.
   */
  fuelDir?: string

  /**
   * Output directory.
   */
  outDir: string

  /**
   * Output file name (excluding extension).
   *
   * @default `rocket-bundle`
   */
  outName?: string
}
export async function bundleConfigPack(options: bundleConfigPackOptions) {
  const {
    frameDir,
    rocketConfig,
    fuelDir,
    outDir,
    outName,
  } = options

  const rocketConfigPath = rocketConfig ?? (frameDir && resolve(frameDir, '../rocket.config.ts'))

  if (!rocketConfigPath)
    throw new Error('`rocketConfig` is required when `frameDir` is not specified')

  const loadedRocketConfig = await loadRocketConfig(rocketConfigPath)

  const referencedFuels = (await extractReferencedFuels(loadedRocketConfig))

  const outputPath = join(outDir, `${outName ?? 'rocket-bundle'}.zip`)

  const data = await createZipBundle({
    loadedRocketConfig,
    frameDir,
    fuelDir,
    referencedFuels,
  })
  await mkdir(dirname(outputPath), { recursive: true })
  await writeFile(outputPath, data)

  logger.success(`🚀 Bundled: "${outputPath}", sha256: "${await createSha256(outputPath)}"`)
}

interface createZipBundleOptions {
  loadedRocketConfig: RocketConfig
  frameDir?: string
  fuelDir?: string
  referencedFuels: string[]
}
export async function createZipBundle(options: createZipBundleOptions): Promise<Uint8Array> {
  const {
    loadedRocketConfig,
    frameDir,
    fuelDir,
    referencedFuels,
  } = options

  const zipData: Zippable = {}

  // 1. Add rocket.config.json5
  try {
    const configStr = stringifyJSON5(loadedRocketConfig, { space: 2 })
    zipData['rocket.config.json5'] = strToU8(configStr)
  }
  catch (error) {
    logger.error('Error serializing rocket config:', error)
    throw new Error('Failed to serialize rocket config to JSON5.')
  }

  // 2. Add frame directory
  if (frameDir) {
    await addDirectoryToZip(zipData, frameDir, 'frame', frameDir)
      .catch(() => { throw new Error('Failed to bundle frame directory.') })
  }

  // 3. Add referenced fuels
  if (referencedFuels.length) {
    if (!fuelDir)
      throw new Error('Detected fuels in the config, but no "fuelDir" was provided')

    for (const fuelPath of referencedFuels) {
      const filePath = join(fuelDir, fuelPath)
      const zipPath = join('fuel', fuelPath)
      try {
        const content = await readFile(filePath)
        zipData[zipPath] = content
      }
      catch {
        throw new Error(`Failed to read fuel file: ${filePath}`)
      }
    }
  }

  return await zipAsync(zipData)
}
