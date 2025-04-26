import type { FileOutputHooks } from '~/helpers/fs'
import { Buffer } from 'node:buffer'
import { access, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createHooks } from 'hookable'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fileOutput } from '~/helpers/fs'

// Mock the fs/promises module
vi.mock('node:fs/promises', async (importOriginal) => {
  const original = await importOriginal<typeof import('node:fs/promises')>()
  return {
    ...original,
    mkdir: vi.fn(),
    writeFile: vi.fn(),
    readFile: vi.fn(),
    access: vi.fn(),
  }
})

const mockedMkdir = vi.mocked(mkdir)
const mockedWriteFile = vi.mocked(writeFile)
const mockedReadFile = vi.mocked(readFile)
const mockedAccess = vi.mocked(access)

describe('fileOutput', () => {
  beforeEach(() => {
    vi.resetAllMocks()
  })

  it('should write data to a new file and create directory', async () => {
    // Arrange
    const filePath = 'path/to/new/file.txt'
    const data = 'Hello, world!'
    mockedAccess.mockRejectedValue(new Error('File not found')) // File doesn't exist

    // Act
    await fileOutput(filePath, data)

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/new', { recursive: true })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
    expect(mockedReadFile).not.toHaveBeenCalled()
  })

  it('should overwrite an existing file when mergeContent is false', async () => {
    // Arrange
    const filePath = 'path/to/existing/file.txt'
    const data = 'New content'
    mockedAccess.mockResolvedValue(undefined) // File exists

    // Act
    await fileOutput(filePath, data, { mergeContent: false })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/existing', { recursive: true })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
    expect(mockedReadFile).not.toHaveBeenCalled() // readFile not called for merge=false
  })

  it('should concatenate data when mergeContent is true for non-JSON files', async () => {
    // Arrange
    const filePath = 'path/to/merge/file.txt'
    const data = ' appended data'
    const existingData = 'Existing content,'
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(Buffer.from(existingData))

    // Act
    await fileOutput(filePath, data, { mergeContent: true })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    expect(mockedReadFile).toHaveBeenCalledWith(filePath)
    const expectedData = Buffer.concat([Buffer.from(existingData), Buffer.from(data)]).toString()
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should deep merge data when mergeContent is true for JSON files', async () => {
    // Arrange
    const filePath = 'path/to/merge/config.json'
    const newData = JSON.stringify({ b: { y: 2 }, c: 3 })
    const existingData = JSON.stringify({ a: 1, b: { x: 1 } })
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(existingData)

    // Act
    await fileOutput(filePath, newData, { mergeContent: true })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    const expectedData = JSON.stringify({ a: 1, b: { x: 1, y: 2 }, c: 3 }, null, 2)
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should deep merge data when mergeContent is "json" for JSON files', async () => {
    // Arrange
    const filePath = 'path/to/merge/another.json'
    const newData = JSON.stringify({ setting: 'new', enabled: true })
    const existingData = JSON.stringify({ setting: 'old', feature: 'x' })
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(existingData)

    // Act
    await fileOutput(filePath, newData, { mergeContent: 'json' })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    const expectedData = JSON.stringify({ setting: 'new', feature: 'x', enabled: true }, null, 2)
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should deep merge arrays within JSON data', async () => {
    // Arrange
    const filePath = 'path/to/merge/array.json'
    const newData = JSON.stringify({ items: [3, 4, 5], other: 'new' })
    const existingData = JSON.stringify({ items: [1, 2, 3], other: 'old' })
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(existingData)

    // Act
    await fileOutput(filePath, newData, { mergeContent: true })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    // Note: defu concatenates arrays, new data first
    const expectedData = JSON.stringify({ items: [3, 4, 5, 1, 2, 3], other: 'new' }, null, 2)
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should overwrite non-JSON file when mergeContent is "json"', async () => {
    // Arrange
    const filePath = 'path/to/overwrite/file.txt'
    const data = 'New text data'
    mockedAccess.mockResolvedValue(undefined) // File exists

    // Act
    await fileOutput(filePath, data, { mergeContent: 'json' })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/overwrite', { recursive: true })
    expect(mockedReadFile).not.toHaveBeenCalled() // readFile not called for merge='json' on non-json
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
  })

  it('should call the onFileOutput hook with initial state', async () => {
    // Arrange
    const filePath = 'path/to/hook/file.txt'
    const data = 'Hook test data'
    const hookable = createHooks<FileOutputHooks>()
    const hookSpy = vi.fn()
    hookable.hook('onFileOutput', hookSpy)
    mockedAccess.mockRejectedValue(new Error('File not found')) // File doesn't exist

    // Act
    await fileOutput(filePath, data, { hookable })

    // Assert
    expect(hookSpy).toHaveBeenCalledTimes(1)
    expect(hookSpy).toHaveBeenCalledWith({ filePath, data })
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/hook', { recursive: true })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
  })

  it('should use modified state from the onFileOutput hook', async () => {
    // Arrange
    const initialFilePath = 'path/to/initial/file.txt'
    const initialData = 'Initial data'
    const modifiedFilePath = 'path/to/modified/new-file.log'
    const modifiedData = 'Modified data by hook'
    const hookable = createHooks<FileOutputHooks>()
    hookable.hook('onFileOutput', (state) => {
      state.filePath = modifiedFilePath
      state.data = modifiedData
    })
    mockedAccess.mockRejectedValue(new Error('File not found')) // File doesn't exist

    // Act
    await fileOutput(initialFilePath, initialData, { hookable })

    // Assert
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/modified', { recursive: true })
    expect(mockedWriteFile).toHaveBeenCalledWith(modifiedFilePath, modifiedData)
  })

  it('should throw error if data is not string when merging JSON', async () => {
    // Arrange
    const filePath = 'path/to/merge/error.json'
    const data = { key: 'value' } // Not a string
    mockedAccess.mockResolvedValue(undefined) // File exists

    // Act & Assert
    await expect(fileOutput(filePath, data as any, { mergeContent: true }))
      .rejects
      .toThrow('Please provide `data` as a JSON stringified object')
    expect(mockedWriteFile).not.toHaveBeenCalled()
  })

  it('should call onFileOutputJsonMerge hook during JSON merge', async () => {
    // Arrange
    const filePath = 'path/to/merge/hook.json'
    const newData = JSON.stringify({ b: 2 })
    const existingData = JSON.stringify({ a: 1 })
    const hookable = createHooks<FileOutputHooks>()
    const mergeHookSpy = vi.fn()
    hookable.hook('onFileOutputJsonMerge', mergeHookSpy)
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(existingData)

    // Act
    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    // Assert
    expect(mergeHookSpy).toHaveBeenCalledTimes(1)
    expect(mergeHookSpy).toHaveBeenCalledWith(expect.objectContaining({
      filePath,
      data: JSON.stringify({ a: 1, b: 2 }, null, 2),
      result: undefined,
    }))
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    const expectedMergedData = JSON.stringify({ a: 1, b: 2 }, null, 2)
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedMergedData)
  })

  it('should use result from onFileOutputJsonMerge hook', async () => {
    // Arrange
    const filePath = 'path/to/merge/hook-override.json'
    const newData = JSON.stringify({ b: 2 })
    const customResult = JSON.stringify({ custom: 'result' })
    const hookable = createHooks<FileOutputHooks>()
    hookable.hook('onFileOutputJsonMerge', (state) => {
      state.result = customResult
    })
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(JSON.stringify({ a: 1 })) // Mocked, but shouldn't be called

    // Act
    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    // Assert
    expect(mockedReadFile).not.toHaveBeenCalledWith(filePath, 'utf-8') // readFile not called
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, customResult)
  })

  it('should call onFileOutputOtherMerge hook during non-JSON merge', async () => {
    // Arrange
    const filePath = 'path/to/merge/hook.txt'
    const newData = ' new data'
    const existingData = 'old data'
    const hookable = createHooks<FileOutputHooks>()
    const mergeHookSpy = vi.fn()
    hookable.hook('onFileOutputOtherMerge', mergeHookSpy)
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(Buffer.from(existingData))

    // Act
    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    // Assert
    expect(mergeHookSpy).toHaveBeenCalledTimes(1)
    expect(mergeHookSpy).toHaveBeenCalledWith(expect.objectContaining({
      filePath,
      data: 'old data new data', // Hook sees final merged data
      result: undefined,
    }))
    expect(mockedReadFile).toHaveBeenCalledWith(filePath)
    const expectedMergedData = Buffer.concat([Buffer.from(existingData), Buffer.from(newData)]).toString()
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedMergedData)
  })

  it('should use result from onFileOutputOtherMerge hook', async () => {
    // Arrange
    const filePath = 'path/to/merge/hook-override.txt'
    const newData = ' new data'
    const customResult = 'custom hook result'
    const hookable = createHooks<FileOutputHooks>()
    hookable.hook('onFileOutputOtherMerge', (state) => {
      state.result = customResult
    })
    mockedAccess.mockResolvedValue(undefined) // File exists
    mockedReadFile.mockResolvedValue(Buffer.from('old data')) // Mocked, but shouldn't be called

    // Act
    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    // Assert
    expect(mockedReadFile).not.toHaveBeenCalledWith(filePath) // readFile not called
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, customResult)
  })
})
