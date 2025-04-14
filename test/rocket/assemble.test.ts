import type { RocketAssembleHooks } from '~/rocket/assemble'
import { mkdir, mkdtemp, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { createHooks } from 'hookable'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { simpleRocketAssemble } from '~/rocket/assemble'

describe('simpleRocketAssemble', () => {
  let frameDir: string
  let outDir: string

  beforeEach(async () => {
    // Create temporary directories for frame and output
    frameDir = await mkdtemp(join(tmpdir(), 'frame-'))
    outDir = await mkdtemp(join(tmpdir(), 'out-'))
  })

  afterEach(async () => {
    // Clean up temporary directories
    await rm(frameDir, { recursive: true, force: true })
    await rm(outDir, { recursive: true, force: true })
  })

  it('should copy files from frameDir to outDir', async () => {
    // Arrange: Create a dummy file in the frame directory
    const testFilePath = 'test.txt'
    const testFileContent = 'Hello, Rocket!'
    await writeFile(join(frameDir, testFilePath), testFileContent)

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables: {},
      excludes: {},
      outDir,
    })

    // Assert: Check if the file exists in the output directory with the correct content
    const outFileContent = await readFile(join(outDir, testFilePath), 'utf-8')
    expect(outFileContent).toBe(testFileContent)
  })

  it('should substitute variables in file content', async () => {
    // Arrange: Create a file with a variable placeholder
    const testFilePath = 'template.txt'
    const templateContent = 'Hello, {{name}}!'
    const expectedContent = 'Hello, World!'
    await writeFile(join(frameDir, testFilePath), templateContent)

    const variables = { '{{name}}': 'World' }

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables,
      excludes: {},
      outDir,
    })

    // Assert: Check if the file content is substituted correctly
    const outFileContent = await readFile(join(outDir, testFilePath), 'utf-8')
    expect(outFileContent).toBe(expectedContent)
  })

  it('should exclude files specified in the excludes map', async () => {
    // Arrange: Create files to include and exclude
    const includeFilePath = 'include.txt'
    const excludeFilePath = 'exclude.txt'
    await writeFile(join(frameDir, includeFilePath), 'Include me!')
    await writeFile(join(frameDir, excludeFilePath), 'Exclude me!')

    const excludes = { [excludeFilePath]: true }

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables: {},
      excludes,
      outDir,
    })

    // Assert: Check that the included file exists and the excluded file does not
    await expect(stat(join(outDir, includeFilePath))).resolves.toBeDefined()
    await expect(stat(join(outDir, excludeFilePath))).rejects.toThrow('ENOENT') // Check for file not found error
  })

  it('should call onFrameFile hook for each file', async () => {
    // Arrange: Create hookable instance and mock hook
    const hookable = createHooks<RocketAssembleHooks>()
    const onFrameFileMock = vi.fn()
    hookable.hook('onFrameFile', onFrameFileMock)

    const testFilePath = 'hook_test.txt'
    await writeFile(join(frameDir, testFilePath), 'Hook me!')

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables: {},
      excludes: {},
      outDir,
      hookable,
    })

    // Assert: Check if the hook was called
    expect(onFrameFileMock).toHaveBeenCalledOnce()
    expect(onFrameFileMock).toHaveBeenCalledWith(expect.objectContaining({
      filePath: testFilePath,
    }))
  })

  it('should allow modifying filePath in onFrameFile hook', async () => {
    // Arrange: Create hook that renames the file
    const hookable = createHooks<RocketAssembleHooks>()
    const originalFilePath = 'original.txt'
    const renamedFilePath = 'renamed_original.txt'

    hookable.hook('onFrameFile', (args) => {
      if (args.filePath === originalFilePath) {
        args.filePath = renamedFilePath
      }
    })

    await writeFile(join(frameDir, originalFilePath), 'Original content')

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables: {},
      excludes: {},
      outDir,
      hookable,
    })

    // Assert: Check if the file was renamed in the output directory
    await expect(stat(join(outDir, renamedFilePath))).resolves.toBeDefined()
    await expect(stat(join(outDir, originalFilePath))).rejects.toThrow('ENOENT')
  })

  it('should allow skipping files via skipFile in onFrameFile hook', async () => {
    // Arrange: Create hook that skips a specific file
    const hookable = createHooks<RocketAssembleHooks>()
    const keepFilePath = 'keep_me.txt'
    const skipFilePath = 'skip_me.txt'

    hookable.hook('onFrameFile', (args) => {
      if (args.filePath === skipFilePath) {
        args.skipFile('Testing skipFile')
      }
    })

    await writeFile(join(frameDir, keepFilePath), 'Keep this content')
    await writeFile(join(frameDir, skipFilePath), 'Skip this content')

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables: {},
      excludes: {},
      outDir,
      hookable,
    })

    // Assert: Check if the correct file was skipped
    await expect(stat(join(outDir, keepFilePath))).resolves.toBeDefined()
    await expect(stat(join(outDir, skipFilePath))).rejects.toThrow('ENOENT')
  })

  it('should handle nested directories and dotfiles', async () => {
    // Arrange: Create nested structure and dotfile
    const dotfilePath = '.dotfile'
    const nestedDir = 'subdir'
    const nestedFilePath = join(nestedDir, 'nested.txt')

    await writeFile(join(frameDir, dotfilePath), 'Dotfile content')
    await mkdir(join(frameDir, nestedDir))
    await writeFile(join(frameDir, nestedFilePath), 'Nested content')

    // Act: Run the assemble function
    await simpleRocketAssemble({
      frameDir,
      variables: {},
      excludes: {},
      outDir,
    })

    // Assert: Check if the structure and files exist in the output directory
    await expect(stat(join(outDir, dotfilePath))).resolves.toBeDefined()
    await expect(readFile(join(outDir, dotfilePath), 'utf-8')).resolves.toBe('Dotfile content')
    await expect(stat(join(outDir, nestedFilePath))).resolves.toBeDefined()
    await expect(readFile(join(outDir, nestedFilePath), 'utf-8')).resolves.toBe('Nested content')
  })
})
