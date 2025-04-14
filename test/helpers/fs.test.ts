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

// Cast mocks for type safety
const mockedMkdir = vi.mocked(mkdir)
const mockedWriteFile = vi.mocked(writeFile)
const mockedReadFile = vi.mocked(readFile)
const mockedAccess = vi.mocked(access)

describe('fileOutput', () => {
  beforeEach(() => {
    // Reset mocks before each test
    vi.resetAllMocks()
  })

  it('should write data to a new file and create directory', async () => {
    const filePath = 'path/to/new/file.txt'
    const data = 'Hello, world!'

    // Mock access to indicate file doesn't exist
    mockedAccess.mockRejectedValue(new Error('File not found'))

    await fileOutput(filePath, data)

    // Check if directory creation was attempted
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/new', { recursive: true })
    // Check if file writing was attempted with correct path and data
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
    // Ensure readFile wasn't called when creating a new file
    expect(mockedReadFile).not.toHaveBeenCalled()
  })

  it('should overwrite an existing file when mergeContent is false', async () => {
    const filePath = 'path/to/existing/file.txt'
    const data = 'New content'
    const existingData = 'Old content'

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined) // Resolves means access granted (file exists)
    // Mock readFile for the initial check (though it shouldn't be used for merging here)
    mockedReadFile.mockResolvedValue(existingData)

    await fileOutput(filePath, data, { mergeContent: false }) // Explicitly false

    // Check directory creation (still happens optimistically)
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/existing', { recursive: true })
    // Check that the file was overwritten with new data
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
    // Ensure readFile was NOT called for merging purposes
    expect(mockedReadFile).not.toHaveBeenCalled() // Simpler check: merge block skipped = no readFile for merge
  })

  it('should concatenate data when mergeContent is true for non-JSON files', async () => {
    const filePath = 'path/to/merge/file.txt'
    const data = ' appended data'
    const existingData = 'Existing content,'

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined)
    // Mock readFile to return existing content
    mockedReadFile.mockResolvedValue(Buffer.from(existingData)) // readFile returns Buffer

    await fileOutput(filePath, data, { mergeContent: true })

    // Check directory creation
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    // Check readFile was called to get existing content
    expect(mockedReadFile).toHaveBeenCalledWith(filePath)
    // Check writeFile was called with concatenated data
    const expectedData = Buffer.concat([Buffer.from(existingData), Buffer.from(data)]).toString()
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should deep merge data when mergeContent is true for JSON files', async () => {
    const filePath = 'path/to/merge/config.json'
    const newData = JSON.stringify({ b: { y: 2 }, c: 3 })
    const existingData = JSON.stringify({ a: 1, b: { x: 1 } })

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined)
    // Mock readFile to return existing JSON content
    mockedReadFile.mockResolvedValue(existingData) // readFile returns string for utf-8

    await fileOutput(filePath, newData, { mergeContent: true })

    // Check directory creation
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    // Check readFile was called to get existing content
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    // Check writeFile was called with deep-merged JSON data
    const expectedData = JSON.stringify({ a: 1, b: { x: 1, y: 2 }, c: 3 })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should deep merge data when mergeContent is "json" for JSON files', async () => {
    const filePath = 'path/to/merge/another.json'
    const newData = JSON.stringify({ setting: 'new', enabled: true })
    const existingData = JSON.stringify({ setting: 'old', feature: 'x' })

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined)
    // Mock readFile to return existing JSON content
    mockedReadFile.mockResolvedValue(existingData)

    await fileOutput(filePath, newData, { mergeContent: 'json' })

    // Check directory creation
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    // Check readFile was called
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    // Check writeFile was called with deep-merged JSON data
    const expectedData = JSON.stringify({ setting: 'new', feature: 'x', enabled: true })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should deep merge arrays within JSON data', async () => {
    const filePath = 'path/to/merge/array.json'
    const newData = JSON.stringify({ items: [3, 4, 5], other: 'new' })
    const existingData = JSON.stringify({ items: [1, 2, 3], other: 'old' })

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined)
    // Mock readFile to return existing JSON content
    mockedReadFile.mockResolvedValue(existingData)

    await fileOutput(filePath, newData, { mergeContent: true })

    // Check directory creation
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/merge', { recursive: true })
    // Check readFile was called
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    // Check writeFile was called with deep-merged data including merged array
    // Note: defu concatenates arrays, new data first
    const expectedData = JSON.stringify({ items: [3, 4, 5, 1, 2, 3], other: 'new' })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedData)
  })

  it('should overwrite non-JSON file when mergeContent is "json"', async () => {
    const filePath = 'path/to/overwrite/file.txt'
    const data = 'New text data'
    const existingData = 'Old text data'

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined)
    // Mock readFile (though it shouldn't be used for merging in this case)
    mockedReadFile.mockResolvedValue(existingData)

    await fileOutput(filePath, data, { mergeContent: 'json' })

    // Check directory creation
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/overwrite', { recursive: true })
    // Check readFile was NOT called for merging purposes because it's not a .json file
    expect(mockedReadFile).not.toHaveBeenCalled()
    // Check writeFile overwrites the file
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
  })

  it('should call the onFileOutput hook with initial state', async () => {
    const filePath = 'path/to/hook/file.txt'
    const data = 'Hook test data'
    const hookable = createHooks<FileOutputHooks>()
    const hookSpy = vi.fn()
    hookable.hook('onFileOutput', hookSpy)

    // Mock access to indicate file doesn't exist
    mockedAccess.mockRejectedValue(new Error('File not found'))

    await fileOutput(filePath, data, { hookable })

    // Check hook was called once
    expect(hookSpy).toHaveBeenCalledTimes(1)
    // Check hook was called with the correct initial arguments
    expect(hookSpy).toHaveBeenCalledWith({ filePath, data })
    // Check mkdir and writeFile were still called after the hook
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/hook', { recursive: true })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, data)
  })

  it('should use modified state from the onFileOutput hook', async () => {
    const initialFilePath = 'path/to/initial/file.txt'
    const initialData = 'Initial data'
    const modifiedFilePath = 'path/to/modified/new-file.log'
    const modifiedData = 'Modified data by hook'

    const hookable = createHooks<FileOutputHooks>()
    hookable.hook('onFileOutput', (state) => {
      state.filePath = modifiedFilePath
      state.data = modifiedData
    })

    // Mock access to indicate file doesn't exist (for the *initial* path check, though merge won't happen)
    mockedAccess.mockRejectedValue(new Error('File not found'))

    await fileOutput(initialFilePath, initialData, { hookable })

    // Check mkdir was called with the *modified* directory
    expect(mockedMkdir).toHaveBeenCalledWith('path/to/modified', { recursive: true })
    // Check writeFile was called with the *modified* path and data
    expect(mockedWriteFile).toHaveBeenCalledWith(modifiedFilePath, modifiedData)
  })

  it('should throw error if data is not string when merging JSON', async () => {
    const filePath = 'path/to/merge/error.json'
    const data = { key: 'value' } // Not a string
    const existingData = JSON.stringify({ a: 1 })

    // Mock access to indicate file exists
    mockedAccess.mockResolvedValue(undefined)
    // Mock readFile (won't be used for merging, but might be called by access check)
    mockedReadFile.mockResolvedValue(existingData)

    // Expect the function to throw the specific error
    await expect(fileOutput(filePath, data as any, { mergeContent: true }))
      .rejects
      .toThrow('Please provide `data` as a JSON stringified object')

    // Ensure writeFile was not called because of the error
    expect(mockedWriteFile).not.toHaveBeenCalled()
  })

  it('should call onFileOutputJsonMerge hook during JSON merge', async () => {
    const filePath = 'path/to/merge/hook.json'
    const newData = JSON.stringify({ b: 2 })
    const existingData = JSON.stringify({ a: 1 })
    const hookable = createHooks<FileOutputHooks>()
    const mergeHookSpy = vi.fn()
    hookable.hook('onFileOutputJsonMerge', mergeHookSpy)

    mockedAccess.mockResolvedValue(undefined)
    mockedReadFile.mockResolvedValue(existingData)

    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    expect(mergeHookSpy).toHaveBeenCalledTimes(1)
    // Check hook argument reflects the final merge state (due to ReactiveArgs)
    expect(mergeHookSpy).toHaveBeenCalledWith(expect.objectContaining({
      filePath,
      data: JSON.stringify({ a: 1, b: 2 }),
      result: undefined,
    }))
    // Check default merge still happened
    expect(mockedReadFile).toHaveBeenCalledWith(filePath, 'utf-8')
    const expectedMergedData = JSON.stringify({ a: 1, b: 2 })
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedMergedData)
  })

  it('should use result from onFileOutputJsonMerge hook', async () => {
    const filePath = 'path/to/merge/hook-override.json'
    const newData = JSON.stringify({ b: 2 })
    const existingData = JSON.stringify({ a: 1 })
    const customResult = JSON.stringify({ custom: 'result' })
    const hookable = createHooks<FileOutputHooks>()
    hookable.hook('onFileOutputJsonMerge', (state) => {
      state.result = customResult
    })

    mockedAccess.mockResolvedValue(undefined)
    mockedReadFile.mockResolvedValue(existingData) // Mocked, but shouldn't be called for merge

    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    // Check default merge readFile was NOT called because hook provided result
    expect(mockedReadFile).not.toHaveBeenCalledWith(filePath, 'utf-8')
    // Check writeFile used the custom result
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, customResult)
  })

  it('should call onFileOutputOtherMerge hook during non-JSON merge', async () => {
    const filePath = 'path/to/merge/hook.txt'
    const newData = ' new data'
    const existingData = 'old data'
    const hookable = createHooks<FileOutputHooks>()
    const mergeHookSpy = vi.fn()
    hookable.hook('onFileOutputOtherMerge', mergeHookSpy)

    mockedAccess.mockResolvedValue(undefined)
    mockedReadFile.mockResolvedValue(Buffer.from(existingData))

    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    expect(mergeHookSpy).toHaveBeenCalledTimes(1)
    // Check hook argument reflects the final merge state (due to ReactiveArgs)
    expect(mergeHookSpy).toHaveBeenCalledWith(expect.objectContaining({
      filePath,
      data: 'old data new data',
      result: undefined,
    }))
    // Check default merge still happened
    expect(mockedReadFile).toHaveBeenCalledWith(filePath)
    const expectedMergedData = Buffer.concat([Buffer.from(existingData), Buffer.from(newData)]).toString()
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, expectedMergedData)
  })

  it('should use result from onFileOutputOtherMerge hook', async () => {
    const filePath = 'path/to/merge/hook-override.txt'
    const newData = ' new data'
    const existingData = 'old data'
    const customResult = 'custom hook result'
    const hookable = createHooks<FileOutputHooks>()
    hookable.hook('onFileOutputOtherMerge', (state) => {
      state.result = customResult
    })

    mockedAccess.mockResolvedValue(undefined)
    mockedReadFile.mockResolvedValue(Buffer.from(existingData)) // Mocked, but shouldn't be called for merge

    await fileOutput(filePath, newData, { hookable, mergeContent: true })

    // Check default merge readFile was NOT called
    expect(mockedReadFile).not.toHaveBeenCalledWith(filePath)
    // Check writeFile used the custom result
    expect(mockedWriteFile).toHaveBeenCalledWith(filePath, customResult)
  })
})
