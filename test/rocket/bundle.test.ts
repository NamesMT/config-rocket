import type { Zippable } from 'fflate'
import type { Dirent, PathLike } from 'node:fs'
import type { RocketConfig } from '~/rocket/config'
import { Buffer } from 'node:buffer'
import * as fs from 'node:fs/promises'
import * as confbox from 'confbox'
import * as fflate from 'fflate'
import * as path from 'pathe'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import * as binaryHelpers from '~/helpers/binary'
import { logger } from '~/helpers/logger'
import { bundleConfigPack, extractReferencedFuels } from '~/rocket/bundle'
import * as configLoader from '~/rocket/config'

// --- Mocking Dependencies ---
vi.mock('node:fs/promises')
vi.mock('fflate')
vi.mock('~/helpers/binary')
vi.mock('~/rocket/config')
vi.mock('confbox')
vi.mock('~/helpers/logger')

describe('extractReferencedFuels', () => {
  it('should return an empty array if no fuel references exist', async () => {
    const config: RocketConfig = {
      variablesResolver: {
        someKey: 'someValue',
        anotherKey: 'another value',
      },
    }
    const fuels = await extractReferencedFuels(config)
    expect(fuels).toEqual([])
  })

  it('should extract a single fuel reference', async () => {
    const config: RocketConfig = {
      variablesResolver: {
        prompt: 'fuel:path/to/my_fuel.txt',
      },
    }
    const fuels = await extractReferencedFuels(config)
    expect(fuels).toEqual(['path/to/my_fuel.txt'])
  })

  it('should extract multiple fuel references', async () => {
    const config: RocketConfig = {
      variablesResolver: {
        prompt: 'fuel:main.txt',
        secondary: 'fuel:secondary.md',
        extraFuel: 'fuel:extra/data.json',
      },
    }
    const fuels = await extractReferencedFuels(config)
    expect(fuels).toEqual(['main.txt', 'secondary.md', 'extra/data.json'])
  })

  it('should handle fuel references with escaped items', async () => {
    const config: RocketConfig = {
      variablesResolver: {
        prompt: 'fuel:path/with"quotes".txt',
      },
    }

    const fuels = await extractReferencedFuels(config)
    expect(fuels).toEqual(['path/with"quotes".txt'])
  })
})

describe('bundleConfigPack', () => {
  const mockFs = vi.mocked(fs)
  const mockFflate = vi.mocked(fflate)
  const mockBinaryHelpers = vi.mocked(binaryHelpers)
  const mockConfigLoader = vi.mocked(configLoader)
  const mockConfbox = vi.mocked(confbox)
  const mockLogger = vi.mocked(logger)

  const baseDir = '/workspace'
  const frameDir = path.join(baseDir, 'frame')
  const frameSubDir = path.join(frameDir, 'subdir')
  const fuelDir = path.join(baseDir, 'fuel')
  const outDir = path.join(baseDir, 'out')
  const defaultRocketConfigPath = path.resolve(frameDir, '../rocket.config.ts')
  const outputZipPath = path.join(outDir, 'rocket-bundle.zip')
  const commonOptions = { frameDir, fuelDir, outDir }
  beforeEach(() => {
    vi.resetAllMocks()

    // Default mock implementations
    mockConfigLoader.loadRocketConfig.mockResolvedValue({ variablesResolver: {} })
    mockConfbox.stringifyJSON5.mockReturnValue('{}')
    mockFs.readFile.mockRejectedValue(new Error('readFile not mocked for this path')) // Default readFile to error
    mockFs.readdir.mockResolvedValue([]) // Default readdir to empty
    mockFs.writeFile.mockResolvedValue(undefined) // Default writeFile to success
    // Mock strToU8 using TextEncoder for simplicity in tests
    mockFflate.strToU8.mockImplementation(str => new TextEncoder().encode(str))
    mockBinaryHelpers.zipAsync.mockResolvedValue(new Uint8Array([1, 2, 3]))
    mockBinaryHelpers.addDirectoryToZip.mockResolvedValue(undefined)
  })

  it('should bundle config, frame, and referenced fuels correctly', async () => {
    // --- Arrange ---
    const mockLoadedConfig: RocketConfig = {
      variablesResolver: {
        mainFuel: 'fuel:main.txt',
        nestedFuel: 'fuel:subdir/nested.txt',
        otherVar: 'value',
      },
    }
    const mockConfigJson5 = '{\n  variablesResolver: {\n    mainFuel: "fuel:main.txt",\n    nestedFuel: "fuel:subdir/nested.txt",\n    otherVar: "value"\n  }\n}'

    mockConfigLoader.loadRocketConfig.mockResolvedValue(mockLoadedConfig)
    mockConfbox.stringifyJSON5.mockReturnValue(mockConfigJson5)

    // Mock readdir for this test (using path normalization)
    mockFs.readdir.mockImplementation(async (dirPath: PathLike) => {
      const receivedPath = path.normalize(dirPath.toString())
      const expectedFrameDir = path.normalize(frameDir)
      const expectedSubDir = path.normalize(frameSubDir)

      if (receivedPath === expectedFrameDir) {
        return [
          { name: 'framefile.js', isFile: () => true, isDirectory: () => false },
          { name: 'subdir', isFile: () => false, isDirectory: () => true },
        ] as Dirent<any>[]
      }
      if (receivedPath === expectedSubDir) {
        return [
          { name: 'nestedframe.txt', isFile: () => true, isDirectory: () => false },
        ] as Dirent<any>[]
      }
      logger.warn(`[Test Mock Warning] Unhandled readdir path: ${receivedPath}`)
      return [] // Default empty
    })

    // Mock readFile for this test (using path normalization)
    mockFs.readFile.mockImplementation(async (filePath: PathLike | fs.FileHandle) => {
      const receivedPath = path.normalize(filePath.toString())
      const expectedFrameFile = path.normalize(path.join(frameDir, 'framefile.js'))
      const expectedNestedFrameFile = path.normalize(path.join(frameSubDir, 'nestedframe.txt'))
      const expectedMainFuel = path.normalize(path.join(fuelDir, 'main.txt'))
      const expectedNestedFuel = path.normalize(path.join(fuelDir, 'subdir/nested.txt'))

      if (receivedPath === expectedFrameFile) {
        return Buffer.from('frame content')
      }
      if (receivedPath === expectedNestedFrameFile) {
        return Buffer.from('nested frame content')
      }
      if (receivedPath === expectedMainFuel) {
        return Buffer.from('main fuel content')
      }
      if (receivedPath === expectedNestedFuel) {
        return Buffer.from('nested fuel content')
      }
      // Throw if an unexpected path is read during the test
      throw new Error(`[Test Mock Error] Unexpected readFile call: ${receivedPath}`)
    })

    // Mock addDirectoryToZip specifically for this test's file structure
    mockBinaryHelpers.addDirectoryToZip.mockImplementation(async (zipDataObj: Zippable, dirPath: string) => {
      if (path.normalize(dirPath) === path.normalize(frameDir)) {
        zipDataObj['frame/framefile.js'] = Buffer.from('frame content')
        zipDataObj['frame/subdir/nestedframe.txt'] = Buffer.from('nested frame content')
      }
    })

    // --- Act ---
    await bundleConfigPack(commonOptions)

    // --- Assert ---
    // 1. Config loading (using default path)
    expect(mockConfigLoader.loadRocketConfig).toHaveBeenCalledWith(defaultRocketConfigPath)

    // 2. Config serialization
    expect(mockConfbox.stringifyJSON5).toHaveBeenCalledWith(mockLoadedConfig, { space: 2 })

    // 3. File system reads (readdir and readFile)
    // addDirectoryToZip handles the recursive reads, so we check its calls
    expect(mockBinaryHelpers.addDirectoryToZip).toHaveBeenCalledWith(expect.any(Object), frameDir, 'frame', frameDir)
    expect(mockFs.readFile).toHaveBeenCalledWith(path.join(fuelDir, 'main.txt')) // Fuel file
    expect(mockFs.readFile).toHaveBeenCalledWith(path.join(fuelDir, 'subdir/nested.txt')) // Nested fuel file

    // 4. Zipping
    expect(mockBinaryHelpers.zipAsync).toHaveBeenCalledTimes(1)
    const zipCall = mockBinaryHelpers.zipAsync.mock.calls[0]
    const zipData = zipCall[0] as Zippable // Data passed to zip

    // Check zip data structure
    expect(zipData['frame/framefile.js']).toEqual(Buffer.from('frame content'))
    expect(zipData['frame/subdir/nestedframe.txt']).toEqual(Buffer.from('nested frame content'))
    expect(zipData['fuel/main.txt']).toEqual(Buffer.from('main fuel content'))
    expect(zipData['fuel/subdir/nested.txt']).toEqual(Buffer.from('nested fuel content'))

    // 5. Writing output
    expect(mockFs.writeFile).toHaveBeenCalledWith(outputZipPath, expect.any(Uint8Array)) // Check path and type

    // 6. Logging
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining(`🚀 Bundled: "${outputZipPath}"`))
  })

  it('should handle no referenced fuels', async () => {
    // --- Arrange ---
    const mockLoadedConfig: RocketConfig = { variablesResolver: { key: 'value' } } // Config without fuel references
    const mockConfigJson5 = '{\n  variablesResolver: {\n    key: "value"\n  }\n}'

    mockConfigLoader.loadRocketConfig.mockResolvedValue(mockLoadedConfig)
    mockConfbox.stringifyJSON5.mockReturnValue(mockConfigJson5)
    // Mock readdir for this test (using path normalization)
    mockFs.readdir.mockImplementation(async (dirPath: PathLike) => {
      const receivedPath = path.normalize(dirPath.toString())
      const expectedFrameDir = path.normalize(frameDir)
      if (receivedPath === expectedFrameDir) {
        return [{ name: 'framefile.js', isFile: () => true, isDirectory: () => false }] as Dirent<any>[]
      }
      logger.warn(`[Test Mock Warning] Unhandled readdir path: ${receivedPath}`)
      return []
    })
    // Mock readFile for this test (using path normalization)
    mockFs.readFile.mockImplementation(async (filePath: PathLike | fs.FileHandle) => {
      const receivedPath = path.normalize(filePath.toString())
      const expectedFrameFile = path.normalize(path.join(frameDir, 'framefile.js'))
      if (receivedPath === expectedFrameFile) {
        return Buffer.from('frame content')
      }
      throw new Error(`[Test Mock Error] Unexpected readFile call: ${receivedPath}`)
    })

    // Mock addDirectoryToZip specifically for this test's file structure
    mockBinaryHelpers.addDirectoryToZip.mockImplementation(async (zipDataObj: Zippable, dirPath: string) => {
      if (path.normalize(dirPath) === path.normalize(frameDir)) {
        zipDataObj['frame/framefile.js'] = Buffer.from('frame content')
      }
    })

    // --- Act ---
    await bundleConfigPack(commonOptions)

    // --- Assert ---
    expect(mockConfigLoader.loadRocketConfig).toHaveBeenCalledWith(defaultRocketConfigPath)
    expect(mockConfbox.stringifyJSON5).toHaveBeenCalledWith(mockLoadedConfig, { space: 2 })
    expect(mockBinaryHelpers.addDirectoryToZip).toHaveBeenCalledWith(expect.any(Object), frameDir, 'frame', frameDir)
    // Ensure no reads were attempted within the fuel directory
    expect(mockFs.readFile).not.toHaveBeenCalledWith(expect.stringContaining(path.normalize(fuelDir))) // Ensure no reads in fuel dir

    expect(mockBinaryHelpers.zipAsync).toHaveBeenCalledTimes(1)
    const zipData = mockBinaryHelpers.zipAsync.mock.calls[0][0] as Zippable
    expect(zipData['rocket.config.json5']).toEqual(mockFflate.strToU8(mockConfigJson5))
    expect(zipData['frame/framefile.js']).toBeDefined()
    expect(Object.keys(zipData).some(k => k.startsWith('fuel/'))).toBe(false) // Assert no fuel entries in zip

    expect(mockFs.writeFile).toHaveBeenCalledWith(outputZipPath, expect.any(Uint8Array))
    expect(mockLogger.success).toHaveBeenCalledWith(expect.stringContaining(`🚀 Bundled: "${outputZipPath}"`))
  })

  it('should use provided rocketConfig path', async () => {
    // --- Arrange ---
    const customConfigPath = '/custom/config/rocket.config.ts'
    const options = { ...commonOptions, rocketConfig: customConfigPath }

    mockConfigLoader.loadRocketConfig.mockResolvedValue({ variablesResolver: {} })
    mockConfbox.stringifyJSON5.mockReturnValue('{}')
    // Mock readdir for this test (empty frameDir, using path normalization)
    mockFs.readdir.mockImplementation(async (dirPath: PathLike) => {
      const receivedPath = path.normalize(dirPath.toString())
      const expectedFrameDir = path.normalize(frameDir)
      if (receivedPath === expectedFrameDir) {
        return []
      }
      logger.warn(`[Test Mock Warning] Unhandled readdir path: ${receivedPath}`)
      return []
    })
    // No readFile mock needed as frameDir is mocked as empty

    // --- Act ---
    await bundleConfigPack(options) // Use the test-specific options here

    // --- Assert ---
    expect(mockConfigLoader.loadRocketConfig).toHaveBeenCalledWith(customConfigPath) // 1. Verify custom path used
    expect(mockConfigLoader.loadRocketConfig).not.toHaveBeenCalledWith(defaultRocketConfigPath) // 2. Verify default path NOT used
  })

  it('should throw error if fuel file reading fails', async () => {
    // --- Arrange ---
    const fuelToFail = 'badfuel.txt'
    const expectedFuelPath = path.join(fuelDir, fuelToFail)
    const mockLoadedConfig: RocketConfig = { variablesResolver: { mainFuel: `fuel:${fuelToFail}` } }
    const readError = new Error('ENOENT') // Simulate file not found error

    mockConfigLoader.loadRocketConfig.mockResolvedValue(mockLoadedConfig)
    mockConfbox.stringifyJSON5.mockReturnValue('{}')
    // Mock readdir for this test (empty frameDir, using path normalization)
    mockFs.readdir.mockImplementation(async (dirPath: PathLike) => {
      const receivedPath = path.normalize(dirPath.toString())
      const expectedFrameDir = path.normalize(frameDir)
      if (receivedPath === expectedFrameDir) {
        return []
      }
      logger.warn(`[Test Mock Warning] Unhandled readdir path: ${receivedPath}`)
      return []
    })
    // Mock readFile to fail specifically for the target fuel path (using normalization)
    mockFs.readFile.mockImplementation(async (p: PathLike | fs.FileHandle) => {
      const receivedPath = path.normalize(p.toString())
      const expectedNormalizedFuelPath = path.normalize(expectedFuelPath)
      if (receivedPath === expectedNormalizedFuelPath) {
        throw readError
      }
      throw new Error(`[Test Mock Error] Unexpected readFile call: ${receivedPath}`)
    })

    // --- Act & Assert ---
    await expect(bundleConfigPack(commonOptions))
      .rejects
      .toThrow(`Failed to read fuel file: ${path.normalize(expectedFuelPath)}`) // Check the specific error message (normalized path)

    // Assert that zip and write were not called due to the error
    expect(mockBinaryHelpers.zipAsync).not.toHaveBeenCalled()
    expect(mockFs.writeFile).not.toHaveBeenCalled()
    expect(mockLogger.success).not.toHaveBeenCalled()
  })

  it('should throw error if zipping fails', async () => {
    // --- Arrange ---
    const zipError: fflate.FlateError = Object.assign(new Error('Zip failed'), { code: 1 }) // Simulate an fflate error object
    mockBinaryHelpers.zipAsync.mockRejectedValue(zipError)
    mockConfigLoader.loadRocketConfig.mockResolvedValue({ variablesResolver: {} })
    mockConfbox.stringifyJSON5.mockReturnValue('{}')
    // Mock readdir for this test (empty frameDir, using path normalization)
    mockFs.readdir.mockImplementation(async (dirPath: PathLike) => {
      const receivedPath = path.normalize(dirPath.toString())
      const expectedFrameDir = path.normalize(frameDir)
      if (receivedPath === expectedFrameDir) {
        return []
      }
      logger.warn(`[Test Mock Warning] Unhandled readdir path: ${receivedPath}`)
      return []
    })
    // No readFile mock needed as frameDir is empty

    // --- Act & Assert ---
    await expect(bundleConfigPack(commonOptions))
      .rejects
      .toThrow(zipError)

    // Assert that writeFile was not called
    expect(mockFs.writeFile).not.toHaveBeenCalled()
    expect(mockLogger.success).not.toHaveBeenCalled()
  })

  it('should throw error if writing zip file fails', async () => {
    // --- Arrange ---
    const writeError = new Error('Disk full') // Simulate a file system write error

    mockConfigLoader.loadRocketConfig.mockResolvedValue({ variablesResolver: {} }) // Config OK (no fuels)
    mockConfbox.stringifyJSON5.mockReturnValue('{}') // Serialization OK

    // Mock readdir for this test (empty frameDir, using path normalization)
    mockFs.readdir.mockImplementation(async (dirPath: PathLike) => {
      const receivedPath = path.normalize(dirPath.toString())
      const expectedFrameDir = path.normalize(frameDir)
      if (receivedPath === expectedFrameDir) {
        return [] // Simulate empty frame directory
      }
      // Any other readdir call is unexpected in this test
      // Warn if readdir is called for unexpected paths in this specific test
      logger.warn(`[Test Mock Warning] Unhandled readdir path in 'writing zip file fails' test: ${receivedPath}`)
      return []
    })

    // readFile should NOT be called (no frame/fuel files), mock it to throw if it is.
    mockFs.readFile.mockRejectedValue(new Error('[Test Mock Error] readFile should not have been called in the "writing zip file fails" test'))

    // zipAsync mock already defaults to success in beforeEach

    // Mock writeFile to throw the simulated error
    mockFs.writeFile.mockRejectedValue(writeError)

    // --- Act & Assert ---
    await expect(bundleConfigPack(commonOptions))
      .rejects
      .toThrow(writeError)
    // Assert logger was not called
    expect(mockLogger.success).not.toHaveBeenCalled()
  })
})
