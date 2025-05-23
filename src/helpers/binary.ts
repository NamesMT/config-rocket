import type { AsyncZipOptions, AsyncZippable, Zippable } from 'fflate'
import type { RocketConfig } from '~/rocket/config'
import { Buffer } from 'node:buffer'
import { readdir, readFile } from 'node:fs/promises'
import { promisify } from 'node:util'
import { parseJSON5 } from 'confbox'
import { unzip, Unzip, UnzipInflate, zip } from 'fflate'
import { join, relative, resolve } from 'pathe'
import { assertsRocketConfig } from '~/rocket/config'

export const unzipAsync = promisify(unzip)

export async function zipAsync(data: AsyncZippable, options?: AsyncZipOptions): Promise<Uint8Array> {
  return await new Promise<Uint8Array>((resolve, reject) => {
    zip(data, options ?? {}, (err, result) => {
      if (err)
        reject(err)
      else resolve(result)
    })
  })
}

export async function readAndZipFiles(filesList: string[], options?: { cwd?: string }): Promise<Uint8Array> {
  const {
    cwd = '',
  } = options ?? {}
  // Note: will see if we should use streaming API or not, for now, we specifically targets `config-rocket` users which should be small files and streaming is not yet necessary.
  const filesListWithData: Record<string, Uint8Array> = {}
  // Note: using this approach to read all files at once.
  await Promise.all(filesList.map(async (filePath) => {
    const fileContent = await readFile(resolve(cwd, filePath))
    filesListWithData[filePath] = fileContent
  }))

  return await zipAsync(filesListWithData, { consume: true })
}

export async function addDirectoryToZip(
  zipData: Zippable,
  dirPath: string,
  zipPrefix: string,
  baseDir: string,
): Promise<void> {
  const entries = await readdir(dirPath, { withFileTypes: true })
  for (const entry of entries) {
    const fullPath = join(dirPath, entry.name)
    const relativePath = relative(baseDir, fullPath)
    const zipPath = join(zipPrefix, relativePath)

    if (entry.isDirectory()) {
      await addDirectoryToZip(zipData, fullPath, zipPrefix, baseDir)
    }
    else if (entry.isFile()) {
      const content = await readFile(fullPath)
      zipData[zipPath] = content // fflate accepts Buffer directly
    }
  }
}

/**
 * This function do a fast extraction of the rocket config from the given uint8 using selective streaming unzip.
 */
export async function extractRocketConfigFromUint8(uint8: Uint8Array): Promise<RocketConfig> {
  return new Promise((resolve, reject) => {
    const configData: Uint8Array[] = []
    let configFound = false

    const unzipper = new Unzip((file) => {
      if (file.name === 'rocket.config.json5') {
        configFound = true
        file.ondata = (err, data, final) => {
          if (err)
            return reject(new Error('Error during unzip stream'))

          configData.push(data)

          if (final) {
            try {
              const configString = Buffer.concat(configData).toString('utf-8')
              const config = parseJSON5<any>(configString)
              assertsRocketConfig(config)
              resolve(config)
            }
            catch {
              reject(new Error('Invalid rocket config'))
            }
          }
        }

        file.start()
      }
    })

    unzipper.register(UnzipInflate)
    unzipper.push(uint8, true)

    // Set a timeout to handle cases where the file might not be found
    setTimeout(() => {
      if (!configFound) {
        reject(new Error('No rocket config found in the archive'))
      }
    }, 300)
  })
}

export async function uint8IsConfigPack(uint8: Uint8Array): Promise<boolean> {
  return await extractRocketConfigFromUint8(uint8)
    .then(() => true)
    .catch(() => false)
}

export async function uint8IsConfigPackWithParameters(uint8: Uint8Array): Promise<boolean> {
  return await extractRocketConfigFromUint8(uint8)
    .then(config => Boolean(config.parameters?.length))
    .catch(() => false)
}
