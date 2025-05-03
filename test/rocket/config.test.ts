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
            operation: 'resolvable',
            resolvable: {
              type: 'match',
              a: '$testParamText',
              b: 'expectedValue',
              result: 'conditionMetValue',
            },
          },
        },
        {
          id: '$orParamA',
          resolver: { operation: 'prompt', type: 'text', label: 'OR Param A' },
        },
        {
          id: '$orParamB',
          resolver: { operation: 'prompt', type: 'confirm', label: 'OR Param B', initial: false },
        },
      ],
      variablesResolver: {
        '{{VAR_TEXT}}': '$testParamText',
        '{{VAR_COND}}': {
          type: 'match',
          a: '$testParamConfirm',
          b: true,
          result: 'fuel:conditional.txt',
        },
        '{{VAR_STATIC}}': 'staticValue',
        '{{VAR_OR_TRUE}}': {
          type: '$or',
          a: { type: 'match', a: '$testParamConfirm', b: true }, // false
          b: { type: 'match', a: '$orParamA', b: 'or_value', result: 'or_result_when_true' }, // true
        },
        '{{VAR_OR_FALSE}}': {
          type: '$or',
          a: { type: 'match', a: '$testParamConfirm', b: true }, // false
          b: { type: 'match', a: '$orParamA', b: 'wrong_value' }, // false
        },
        '{{VAR_OR_NESTED}}': {
          type: '$or',
          a: { type: 'match', a: '$testParamConfirm', b: true }, // false
          b: { // Nested $or
            type: '$or',
            a: { type: 'match', a: '$orParamB', b: true }, // false
            b: { type: 'match', a: '$orParamA', b: 'or_value', result: 'outer_or_result_when_true' }, // true
          },
        },
      },
      filesBuildResolver: {
        'builder-key': { filePath: 'built.txt', content: 'fuel:builder.txt' },
        'builder-key-cond': {
          filePath: 'built_cond.txt',
          content: {
            type: 'match',
            a: '$testParamConfirm',
            b: false,
            result: 'fuel:builder_cond.txt',
          },
        },
      },
      excludesResolver: {
        'exclude_me.txt': {
          type: 'match',
          a: '$testParamText',
          b: 'exclude',
          result: true,
        },
        'keep_me.txt': {
          type: 'match',
          a: '$testParamConfirm',
          b: true,
          result: true,
        },
        'exclude_or.txt': {
          type: '$or',
          a: { type: 'match', a: '$testParamConfirm', b: true }, // false
          b: { type: 'match', a: '$orParamB', b: true }, // false
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
        return false // Default mock value for $testParamConfirm
      if (label.includes('OR Param A'))
        return 'or_value' // Mock value for $orParamA
      if (label.includes('OR Param B'))
        return false // Mock value for $orParamB
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
    // Adjust count for new parameters
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
    expect(onParameterMock).toHaveBeenCalledWith(expect.objectContaining({
      parameter: expect.objectContaining({ id: '$orParamA' }),
      resolvedParameters: expect.any(Object),
    }))
    expect(onParameterMock).toHaveBeenCalledWith(expect.objectContaining({
      parameter: expect.objectContaining({ id: '$orParamB' }),
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
    // Adjust count for new variables
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
    expect(onVariableResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      variableResolver: expect.arrayContaining(['{{VAR_OR_TRUE}}', expect.objectContaining({ type: '$or' })]),
      resolvedVariables: expect.any(Object),
    }))
    expect(onVariableResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      variableResolver: expect.arrayContaining(['{{VAR_OR_FALSE}}', expect.objectContaining({ type: '$or' })]),
      resolvedVariables: expect.any(Object),
    }))
    expect(onVariableResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      variableResolver: expect.arrayContaining(['{{VAR_OR_NESTED}}', expect.objectContaining({ type: '$or' })]),
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
    // Adjust count for new excludes
    expect(onExcludeResolverMock).toHaveBeenCalledTimes(Object.keys(mockConfig.excludesResolver!).length)
    expect(onExcludeResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      excludeResolver: expect.arrayContaining(['exclude_me.txt', expect.objectContaining({ type: 'match' })]),
      resolvedExcludes: expect.any(Object),
    }))
    expect(onExcludeResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      excludeResolver: expect.arrayContaining([
        'keep_me.txt',
        {
          type: 'match',
          a: '$testParamConfirm',
          b: true,
          result: true,
        },
      ]),
      resolvedExcludes: expect.any(Object),
    }))
    expect(onExcludeResolverMock).toHaveBeenCalledWith(expect.objectContaining({
      excludeResolver: expect.arrayContaining(['exclude_or.txt', expect.objectContaining({ type: '$or' })]),
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

  it('should correctly resolve variables and file builders using the "format" condition', async () => {
    // Arrange
    const formatConfig: RocketConfig = {
      parameters: [
        { id: '$paramA', resolver: { operation: 'prompt', type: 'text', label: 'Param A' } },
        { id: '$paramB', resolver: { operation: 'prompt', type: 'confirm', label: 'Param B', initial: true } },
      ],
      variablesResolver: {
        '{{VAR_FORMAT}}': {
          type: 'format',
          a: '$paramA',
          b: '$paramB',
          result: 'A is {a}, B is {b}',
        },
        '{{VAR_FORMAT_LITERAL}}': {
          type: 'format',
          a: 'LiteralA',
          b: false, // Literal boolean
          result: 'Static A: {a}, Static B: {b}',
        },
      },
      filesBuildResolver: {
        'builder-format': {
          filePath: 'formatted.txt',
          content: {
            type: 'format',
            a: '$paramA',
            b: 'LiteralB',
            result: 'File content: {a} and {b}',
          },
        },
      },
    }

    // Mock loadConfig for this specific test
    vi.mocked(loadConfig).mockResolvedValue({
      config: formatConfig,
      configFile: join(tempDir, 'rocket.config.js'),
      layers: [],
    })
    // Mock prompts for this specific test
    vi.mocked(consola.prompt).mockImplementation(async (label: string) => {
      if (label.includes('Param A'))
        return 'ValueForA'
      if (label.includes('Param B'))
        return true // Mock confirm value
      throw new Error(`Unexpected prompt: ${label}`)
    })

    // Act
    const { resolvedParameters, resolvedVariables, resolvedFilesBuilder } = await parseRocketConfig(formatConfig)

    // Assert
    expect(resolvedParameters.$paramA).toBe('ValueForA')
    expect(resolvedParameters.$paramB).toBe(true)

    expect(resolvedVariables['{{VAR_FORMAT}}']).toBe('A is ValueForA, B is true')
    expect(resolvedVariables['{{VAR_FORMAT_LITERAL}}']).toBe('Static A: LiteralA, Static B: false')

    expect(resolvedFilesBuilder['builder-format'].content).toBe('File content: ValueForA and LiteralB')
  })

  // --- $or Condition Tests ---

  it('should correctly resolve variables using the "$or" condition', async () => {
    // Arrange - mockConfig and prompts are set in beforeEach

    // Act
    const { resolvedParameters, resolvedVariables } = await parseRocketConfig(mockConfig)

    // Assert
    // Verify parameters used in $or conditions were resolved correctly
    expect(resolvedParameters.$orParamA).toBe('or_value')
    expect(resolvedParameters.$orParamB).toBe(false)

    // Verify $or variable resolution
    // {{VAR_OR_TRUE}}: 'b' condition is true, so 'result' is returned
    expect(resolvedVariables['{{VAR_OR_TRUE}}']).toBe('or_result_when_true')
    // {{VAR_OR_FALSE}}: Both 'a' and 'b' are false, so default '' is returned
    expect(resolvedVariables['{{VAR_OR_FALSE}}']).toBe('')
    // {{VAR_OR_NESTED}}: Outer 'b' resolves to true (because inner 'b' is true),
    // so outer 'result' is returned.
    expect(resolvedVariables['{{VAR_OR_NESTED}}']).toBe('outer_or_result_when_true')
  })

  it('should correctly resolve excludes using the "$or" condition', async () => {
    // Arrange - mockConfig and prompts are set in beforeEach

    // Act
    const { resolvedExcludes } = await parseRocketConfig(mockConfig)

    // Assert
    // exclude_or.txt: Both 'a' and 'b' conditions are false, so the $or is false.
    // The 'result' (true) only applies if the $or condition is met.
    // Therefore, the file should NOT be excluded.
    expect(resolvedExcludes['exclude_or.txt']).toBe(false)
  })

  // TODO: Add more tests for complex conditions (nested a/b and subject/condition), fuel resolution, etc.
  // TODO: Test $or within fileBuildResolver content
})
