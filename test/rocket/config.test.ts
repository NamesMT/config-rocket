import type { ParseRocketConfigHooks, RocketConfig } from '~/rocket/config'
import { mkdtemp, rm } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { loadConfig } from 'c12' // To mock
import { consola } from 'consola' // To mock
import { createHooks } from 'hookable'
import { join } from 'pathe'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { parseRocketConfig } from '~/rocket/config'

// Mock c12 loadConfig
vi.mock('c12', async () => ({
  loadConfig: vi.fn(),
}))

// Mock consola prompt
// Mock consola - provide mocks for used methods
vi.mock('consola', () => ({
  consola: {
    prompt: vi.fn(),
    // Add other common methods in case they are used internally or in future tests
    log: vi.fn(),
    info: vi.fn(),
    warn: vi.fn(),
    error: vi.fn(),
    debug: vi.fn(),
    success: vi.fn(),
  },
}))

describe('parseRocketConfig', () => {
  let tempDir: string
  let mockConfig: RocketConfig

  beforeEach(async () => {
    tempDir = await mkdtemp(join(tmpdir(), 'config-test-'))

    // Define a reusable mock config object
    mockConfig = {
      parameters: [
        {
          id: '$testParamText',
          resolver: { operation: 'prompt', type: 'text', label: 'Test Text Param' },
        },
        {
          id: '$testParamConfirm',
          resolver: { operation: 'prompt', type: 'confirm', label: 'Test Confirm Param', initial: false },
        },
        {
          id: '$conditionParam',
          resolver: {
            operation: 'condition',
            condition: {
              subject: '$testParamText',
              type: 'match',
              condition: 'expectedValue',
              result: 'conditionMetValue',
            },
          },
        },
      ],
      variablesResolver: {
        '{{VAR_TEXT}}': '$testParamText',
        '{{VAR_COND}}': {
          subject: '$testParamConfirm',
          type: 'match',
          condition: true,
          result: 'fuel:conditional.txt',
        },
        '{{VAR_STATIC}}': 'staticValue',
      },
      filesBuildResolver: {
        'builder-key': { filePath: 'built.txt', content: 'fuel:builder.txt' },
        'builder-key-cond': {
          filePath: 'built_cond.txt',
          content: {
            subject: '$testParamConfirm',
            type: 'match',
            condition: false,
            result: 'fuel:builder_cond.txt',
          },
        },
      },
      excludesResolver: {
        'exclude_me.txt': {
          subject: '$testParamText',
          type: 'match',
          condition: 'exclude',
          result: true,
        },
        'keep_me.txt': {
          subject: '$testParamConfirm',
          type: 'match',
          condition: true,
          result: true,
        },
      },
    }

    // Configure the mock loadConfig to return our mockConfig
    vi.mocked(loadConfig).mockResolvedValue({
      config: mockConfig,
      configFile: join(tempDir, 'rocket.config.js'), // Mock path
      layers: [],
    })

    // Configure mock consola prompts
    vi.mocked(consola.prompt).mockImplementation(async (label: string) => {
      if (label.includes('Text Param'))
        return 'promptedTextValue'
      if (label.includes('Confirm Param'))
        return false // Default mock value
      throw new Error(`Unexpected prompt: ${label}`)
    })
  })

  afterEach(async () => {
    await rm(tempDir, { recursive: true, force: true })
    vi.clearAllMocks() // Clear mocks between tests
  })

  // --- Hook Tests ---

  it('should call onParameter hook for each parameter', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const onParameterMock = vi.fn()
    hookable.hook('onParameter', onParameterMock)

    // Act
    await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(onParameterMock).toHaveBeenCalledTimes(mockConfig.parameters!.length)
    expect(onParameterMock).toHaveBeenCalledWith(expect.objectContaining({
      parameter: expect.objectContaining({ id: '$testParamText' }),
      resolvedParameters: expect.any(Object),
    }))
    expect(onParameterMock).toHaveBeenCalledWith(expect.objectContaining({
      parameter: expect.objectContaining({ id: '$testParamConfirm' }),
      resolvedParameters: expect.any(Object),
    }))
    expect(onParameterMock).toHaveBeenCalledWith(expect.objectContaining({
      parameter: expect.objectContaining({ id: '$conditionParam' }),
      resolvedParameters: expect.any(Object),
    }))
  })

  it('should allow modifying resolvedParameters in onParameter hook', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const hookOverrideValue = 'valueFromHook'
    hookable.hook('onParameter', ({ parameter, resolvedParameters }) => {
      if (parameter.id === '$testParamText') {
        resolvedParameters[parameter.id] = hookOverrideValue // Override before resolver runs
      }
    })

    // Act
    const { resolvedParameters } = await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(consola.prompt).not.toHaveBeenCalledWith(expect.stringContaining('Text Param')) // Prompt should be skipped
    expect(resolvedParameters.$testParamText).toBe(hookOverrideValue)
    expect(resolvedParameters.$testParamConfirm).toBe(false) // Should still resolve normally
  })

  it('should call onVariableResolver hook for each variable', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const onVariableResolverMock = vi.fn()
    hookable.hook('onVariableResolver', onVariableResolverMock)

    // Act
    await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(onVariableResolverMock).toHaveBeenCalledTimes(Object.keys(mockConfig.variablesResolver!).length)
    expect(onVariableResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      variableResolver: expect.arrayContaining(['{{VAR_TEXT}}', '$testParamText']),
      resolvedVariables: expect.any(Object),
    }))
    expect(onVariableResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      variableResolver: expect.arrayContaining(['{{VAR_COND}}', expect.any(Object)]), // Condition object
      resolvedVariables: expect.any(Object),
    }))
    expect(onVariableResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      variableResolver: expect.arrayContaining(['{{VAR_STATIC}}', 'staticValue']),
      resolvedVariables: expect.any(Object),
    }))
  })

  it('should allow modifying resolvedVariables in onVariableResolver hook', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const hookOverrideValue = 'hookedVariableValue'
    hookable.hook('onVariableResolver', ({ variableResolver, resolvedVariables }) => {
      const [variableName] = variableResolver
      if (variableName === '{{VAR_TEXT}}') {
        resolvedVariables[variableName] = hookOverrideValue // Override before resolver runs
      }
    })

    // Act
    const { resolvedVariables } = await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(resolvedVariables['{{VAR_TEXT}}']).toBe(hookOverrideValue)
    expect(resolvedVariables['{{VAR_COND}}']).toBe('') // Condition (false) results in empty string
    expect(resolvedVariables['{{VAR_STATIC}}']).toBe('staticValue') // Static value remains
  })

  it('should call onFileBuildResolver hook for each file builder entry', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const onFileBuildResolverMock = vi.fn()
    hookable.hook('onFileBuildResolver', onFileBuildResolverMock)

    // Act
    await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(onFileBuildResolverMock).toHaveBeenCalledTimes(Object.keys(mockConfig.filesBuildResolver!).length)
    expect(onFileBuildResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      fileBuildResolver: expect.arrayContaining(['builder-key', expect.objectContaining({ content: 'fuel:builder.txt' })]),
      resolvedFilesBuilder: expect.any(Object),
    }))
    expect(onFileBuildResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      fileBuildResolver: expect.arrayContaining(['builder-key-cond', expect.objectContaining({ content: expect.any(Object) })]), // Condition object
      resolvedFilesBuilder: expect.any(Object),
    }))
  })

  it('should allow modifying resolvedFilesBuilder in onFileBuildResolver hook', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const hookOverrideContent = 'hookedBuilderContent'
    hookable.hook('onFileBuildResolver', ({ fileBuildResolver, resolvedFilesBuilder }) => {
      const [builderKey, builderConfig] = fileBuildResolver
      if (builderKey === 'builder-key') {
        resolvedFilesBuilder[builderKey] = { filePath: builderConfig.filePath, content: hookOverrideContent } // Override before resolver runs
      }
    })

    // Act
    const { resolvedFilesBuilder } = await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(resolvedFilesBuilder['builder-key'].content).toBe(hookOverrideContent)
    expect(resolvedFilesBuilder['builder-key-cond'].content).toBe('fuel:builder_cond.txt') // Condition (false) met its result
  })

  it('should call onExcludeResolver hook for each exclude entry', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    const onExcludeResolverMock = vi.fn()
    hookable.hook('onExcludeResolver', onExcludeResolverMock)

    // Act
    await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(onExcludeResolverMock).toHaveBeenCalledTimes(Object.keys(mockConfig.excludesResolver!).length)
    expect(onExcludeResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      excludeResolver: expect.arrayContaining(['exclude_me.txt', expect.any(Object)]), // Condition object
      resolvedExcludes: expect.any(Object),
    }))
    expect(onExcludeResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      excludeResolver: expect.arrayContaining([
        'keep_me.txt',
        { condition: true, result: true, subject: '$testParamConfirm', type: 'match' },
      ]), // Static boolean
      resolvedExcludes: expect.any(Object),
    }))
  })

  it('should allow modifying resolvedExcludes in onExcludeResolver hook', async () => {
    // Arrange
    const hookable = createHooks<ParseRocketConfigHooks>()
    hookable.hook('onExcludeResolver', ({ excludeResolver, resolvedExcludes }) => {
      const [excludeName] = excludeResolver
      if (excludeName === 'exclude_me.txt') {
        resolvedExcludes[excludeName] = true // Force exclude via hook
      }
      if (excludeName === 'keep_me.txt') {
        resolvedExcludes[excludeName] = true // Override static false to true
      }
    })

    // Act
    const { resolvedExcludes } = await parseRocketConfig(mockConfig, { hookable })

    // Assert
    expect(resolvedExcludes['exclude_me.txt']).toBe(true) // Overridden by hook
    expect(resolvedExcludes['keep_me.txt']).toBe(true) // Overridden by hook
  })

  // TODO: Add more tests for complex conditions, fuel resolution (needs more mocking), etc.
})
