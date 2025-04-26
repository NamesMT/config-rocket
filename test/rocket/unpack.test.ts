import type { FlateError } from 'fflate'
import type { Mock } from 'vitest'
import { rm } from 'node:fs/promises'
import consola from 'consola'
import { strToU8, zip } from 'fflate'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { unpackFromUrl } from '~/cli/unpack'
import { fileOutput } from '~/helpers/fs'
import { logger } from '~/helpers/logger'
import { rocketAssemble } from '~/rocket/assemble'

vi.mock('node:fs/promises', () => ({
  rm: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('~/helpers/fs', () => ({
  fileOutput: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('~/rocket/assemble', () => ({
  rocketAssemble: vi.fn().mockResolvedValue(undefined),
}))
vi.mock('~/helpers/logger', () => ({
  logger: {
    info: vi.fn(),
    start: vi.fn(),
    success: vi.fn(),
    error: vi.fn(),
  },
}))
vi.mock('consola', () => ({
  default: {
    prompt: vi.fn(),
  },
}))
vi.mock('fflate', async (importOriginal) => {
  const original = await importOriginal<typeof import('fflate')>()
  return {
    ...original,
    unzip: vi.fn(), // We'll mock specific implementations in tests
  }
})

function createMockZip(files: Record<string, string>): Promise<Uint8Array> {
  return new Promise((resolve, reject) => {
    const data: Record<string, Uint8Array> = {}
    for (const [name, content] of Object.entries(files)) {
      data[name] = strToU8(content)
    }
    zip(data, (err, data) => {
      if (err)
        return reject(err)
      resolve(data)
    })
  })
}

describe('unpackFromUrl', () => {
  const mockUrl = 'http://example.com/pack.zip'
  let mockFetch: Mock

  beforeEach(() => {
    vi.clearAllMocks()
    mockFetch = vi.fn()
    globalThis.fetch = mockFetch
  })

  afterEach(() => {
    // @ts-expect-error - fetch is mocked
    delete globalThis.fetch
  })

  it('should download, extract, and assemble a valid rocket config pack', async () => {
    // Arrange
    const mockZipData = await createMockZip({
      'rocket.config.json5': '{ "name": "test-pack" }',
      'frame/file1.txt': 'frame content',
      'fuel/file2.txt': 'fuel content',
    })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockZipData.buffer,
    })
    const mockUnzip = vi.mocked(await import('fflate')).unzip
    mockUnzip.mockImplementation((_buffer, callback) => {
      const unzipped = {
        'rocket.config.json5': strToU8('{ "name": "test-pack" }'),
        'frame/file1.txt': strToU8('frame content'),
        'fuel/file2.txt': strToU8('fuel content'),
      }
      setTimeout(() => callback(null, unzipped), 0)
      return vi.fn()
    })

    // Act
    await unpackFromUrl(mockUrl)

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(mockUrl)
    expect(logger.info).toHaveBeenCalledWith(`Downloading archive from ${mockUrl}`)
    expect(logger.start).toHaveBeenCalledWith('Extracting archive (to `.tmp` if needed)...')
    expect(mockUnzip).toHaveBeenCalled()
    expect(fileOutput).toHaveBeenCalledTimes(3)
    expect(fileOutput).toHaveBeenCalledWith('.tmp/rocket.config.json5', '{ "name": "test-pack" }', { hookable: undefined })
    expect(fileOutput).toHaveBeenCalledWith('.tmp/frame/file1.txt', 'frame content', { hookable: undefined })
    expect(fileOutput).toHaveBeenCalledWith('.tmp/fuel/file2.txt', 'fuel content', { hookable: undefined })
    expect(logger.success).toHaveBeenCalledWith('Extracted successfully.')
    expect(logger.start).toHaveBeenCalledWith('Assembling the config according to `rocketConfig`...')
    expect(rocketAssemble).toHaveBeenCalledWith({
      frameDir: '.tmp/frame',
      fuelDir: '.tmp/fuel',
      outDir: '.',
      hookable: undefined,
    })
    expect(logger.start).toHaveBeenCalledWith('Assembled successfully, removing temporary files...')
    expect(rm).toHaveBeenCalledWith('.tmp', { recursive: true })
    expect(logger.success).toHaveBeenCalledWith('All done, enjoy your new config!')
  })

  it('should handle download failure', async () => {
    // Arrange
    mockFetch.mockResolvedValue({
      ok: false,
    })

    // Act & Assert
    await expect(unpackFromUrl(mockUrl)).rejects.toThrow(`Failed to download archive from ${mockUrl}`)
    expect(logger.info).toHaveBeenCalledWith(`Downloading archive from ${mockUrl}`)
    expect(logger.start).not.toHaveBeenCalled()
    expect(rocketAssemble).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it('should handle unzip failure', async () => {
    // Arrange
    const mockZipData = await createMockZip({ 'file.txt': 'content' })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockZipData.buffer,
    })
    const mockUnzip = vi.mocked(await import('fflate')).unzip
    const unzipError: FlateError = new Error('Zip corrupted') as FlateError
    unzipError.code = 1 // Example error code for FlateError
    mockUnzip.mockImplementation((_buffer, callback) => {
      setTimeout(() => callback(unzipError, {}), 0)
      return vi.fn()
    })

    // Act & Assert
    await expect(unpackFromUrl(mockUrl)).rejects.toThrow('Failed to extract the archive.')
    expect(logger.info).toHaveBeenCalledWith(`Downloading archive from ${mockUrl}`)
    expect(logger.start).toHaveBeenCalledWith('Extracting archive (to `.tmp` if needed)...')
    expect(mockUnzip).toHaveBeenCalled()
    expect(fileOutput).not.toHaveBeenCalled()
    expect(logger.success).not.toHaveBeenCalledWith('Extracted successfully.')
    expect(rocketAssemble).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it('should extract non-assembly directly when nonAssemblyBehavior is true', async () => {
    // Arrange
    const mockZipData = await createMockZip({
      'some_file.txt': 'some content',
      'another_dir/data.json': '{"key": "value"}',
    })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockZipData.buffer,
    })
    const mockUnzip = vi.mocked(await import('fflate')).unzip
    mockUnzip.mockImplementation((_buffer, callback) => {
      const unzipped = {
        'some_file.txt': strToU8('some content'),
        'another_dir/data.json': strToU8('{"key": "value"}'),
      }
      setTimeout(() => callback(null, unzipped), 0)
      return vi.fn()
    })

    // Act
    await unpackFromUrl(mockUrl, { nonAssemblyBehavior: true })

    // Assert
    expect(mockFetch).toHaveBeenCalledWith(mockUrl)
    expect(logger.start).toHaveBeenCalledWith('Extracting archive (to `.tmp` if needed)...')
    expect(mockUnzip).toHaveBeenCalled()
    expect(fileOutput).toHaveBeenCalledTimes(2)
    expect(fileOutput).toHaveBeenCalledWith('some_file.txt', 'some content', { hookable: undefined })
    expect(fileOutput).toHaveBeenCalledWith('another_dir/data.json', '{"key": "value"}', { hookable: undefined })
    expect(logger.success).toHaveBeenCalledWith('Extracted successfully.')
    // Should not assemble or remove .tmp
    expect(rocketAssemble).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it('should abort non-assembly extraction when nonAssemblyBehavior is false', async () => {
    // Arrange
    const mockZipData = await createMockZip({ 'not_a_rocket.txt': 'data' })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockZipData.buffer,
    })
    const mockUnzip = vi.mocked(await import('fflate')).unzip
    mockUnzip.mockImplementation((_buffer, callback) => {
      const unzipped = { 'not_a_rocket.txt': strToU8('data') }
      setTimeout(() => callback(null, unzipped), 0)
      return vi.fn()
    })

    // Act & Assert
    await expect(unpackFromUrl(mockUrl, { nonAssemblyBehavior: false }))
      .rejects
      .toThrow('Invalid config pack: "rocket.config.json5" not found.')
    expect(logger.start).toHaveBeenCalledWith('Extracting archive (to `.tmp` if needed)...')
    expect(mockUnzip).toHaveBeenCalled()
    expect(fileOutput).not.toHaveBeenCalled() // Should abort before writing files
    expect(logger.success).not.toHaveBeenCalledWith('Extracted successfully.')
    expect(rocketAssemble).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it('should prompt and continue non-assembly extraction when user confirms', async () => {
    // Arrange
    const mockZipData = await createMockZip({ 'some_file.txt': 'content' })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockZipData.buffer,
    })
    const mockUnzip = vi.mocked(await import('fflate')).unzip
    mockUnzip.mockImplementation((_buffer, callback) => {
      const unzipped = { 'some_file.txt': strToU8('content') }
      setTimeout(() => callback(null, unzipped), 0)
      return vi.fn()
    })
    vi.mocked(consola.prompt).mockResolvedValue(true)

    // Act
    await unpackFromUrl(mockUrl, { nonAssemblyBehavior: 'prompt' })

    // Assert
    expect(consola.prompt).toHaveBeenCalledWith(
      'Archive is not a valid rocket config pack, do you want to continue extract anyway?',
      { type: 'confirm', cancel: 'null' },
    )
    expect(fileOutput).toHaveBeenCalledTimes(1)
    expect(fileOutput).toHaveBeenCalledWith('some_file.txt', 'content', { hookable: undefined })
    expect(logger.success).toHaveBeenCalledWith('Extracted successfully.')
    expect(rocketAssemble).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })

  it('should prompt and abort non-assembly extraction when user cancels', async () => {
    // Arrange
    const mockZipData = await createMockZip({ 'some_file.txt': 'content' })
    mockFetch.mockResolvedValue({
      ok: true,
      arrayBuffer: async () => mockZipData.buffer,
    })
    const mockUnzip = vi.mocked(await import('fflate')).unzip
    mockUnzip.mockImplementation((_buffer, callback) => {
      const unzipped = { 'some_file.txt': strToU8('content') }
      setTimeout(() => callback(null, unzipped), 0)
      return vi.fn()
    })
    vi.mocked(consola.prompt).mockResolvedValue(false)

    // Act & Assert
    await expect(unpackFromUrl(mockUrl, { nonAssemblyBehavior: 'prompt' }))
      .rejects
      .toThrow('Invalid config pack: "rocket.config.json5" not found.')
    expect(consola.prompt).toHaveBeenCalled()
    expect(fileOutput).not.toHaveBeenCalled()
    expect(logger.success).not.toHaveBeenCalledWith('Extracted successfully.')
    expect(rocketAssemble).not.toHaveBeenCalled()
    expect(rm).not.toHaveBeenCalled()
  })
})
