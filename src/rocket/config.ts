import type { UserInputConfig } from 'c12'
import type { Hookable, Hooks } from 'hookable'
import { readFile } from 'node:fs/promises'
import { objectPick, replaceMap } from '@namesmt/utils'
import { loadConfig } from 'c12'
import { consola } from 'consola'
import { dirname, resolve } from 'pathe'

export interface RocketConfigParameter {
  id: string
  resolver: RocketConfigParameterResolver
}

export type RocketConfigParameterResolver = RocketConfigParameterResolverOperationPrompt | RocketConfigParameterResolverOperationResolvable

export type RocketConfigParameterResolverOperationPrompt = {
  operation: 'prompt'
  label: string
} & (
    {
      type: 'text'
      initial?: string
    } | {
      type: 'confirm'
      initial?: boolean
    }
  )

export interface RocketConfigParameterResolverOperationResolvable {
  operation: 'resolvable'
  resolvable: RocketResolvable
}

export type RocketResolvable<AllowedResult = string | true> = {
  type: RocketResolvableType
  a: RocketResolvable<any> | RocketConfigParameter['id'] // Parameter id or nested resolvable
  b: RocketResolvable<any> | string | boolean // Nested resolvable or statement
} & (
    {
      type: Exclude<RocketResolvableType, 'format' | '$or'>
      result?: AllowedResult
    } | {
      type: Extract<RocketResolvableType, '$or'>
      result?: never
    }
    | (AllowedResult extends string ? {
      type: Extract<RocketResolvableType, 'format'>
      result: string
    } : never)
  )

/**
 * Possible resolvable types.
 *
 * + `'match'`: `a` and `b` must match exactly.
 * + `'contain'`: `a` must contains `b`.
 * + `'not'`: `a` must not match `b`.
 * + `'format'`: use `a` and `b` to create a formatted string using `result` as a template string.
 * + `'$or'`: => `a || b`, returns the value of the input `a` | `b`.
 */
export type RocketResolvableType = 'match' | 'contain' | 'not' | 'format' | '$or'

/**
 * A fuel reference is a path to a fuel file, e.g: `fuel:instruct_very-nice-rocket.md`.
 */
export type FuelReference = `fuel:${string}`

export type RocketResolvableString = string | RocketConfigParameter['id'] | FuelReference

export interface RocketConfigVariablesResolver { [key: string]: RocketResolvableString | RocketResolvable<RocketResolvableString> }

export interface RocketConfigExcludesResolver { [filePath: string]: RocketResolvable<true> }

export interface RocketConfigFilesBuilderResolver { [key: string]: { filePath: string, content: RocketResolvableString | RocketResolvable<RocketResolvableString> } }

export interface RocketConfig {
  /**
   * The rocket's available parameters, allowing users to customize the launch.
   *
   * Example:
   * ```ts
   * {
   *   parameters: [
   *     {
   *       id: '$input-BRAVE_API_KEY',
   *       resolver: {
   *         operation: 'prompt',
   *         label: 'Enter your Brave API key',
   *         type: 'text',
   *       }
   *     },
   *     {
   *       id: '$confirm-MEMORY_BANK_LOAD-disabled',
   *       resolver: {
   *         operation: 'prompt',
   *         label: 'Disable "Memory Bank Load" instruction?',
   *         type: 'confirm',
   *         initial: false,
   *       }
   *     },
   *     {
   *       id: 'example-reference-resolvable',
   *       resolver: {
   *         operation: 'resolvable',
   *         resolvable: {
   *           type: 'match',
   *           a: '$input-BRAVE_API_KEY',
   *           b: 'SHOULD MATCH THIS',
   *           result: 'ABCDE',
   *         },
   *       }
   *     },
   *     {
   *       id: 'example-nested-resolvable',
   *       resolver: {
   *         operation: 'resolvable',
   *         resolvable: {
   *           type: '$or',
   *           a: {
   *             type: 'match',
   *             a: '$input-BRAVE_API_KEY',
   *             b: 'SHOULD MATCH THIS',
   *             result: 'ABCDE',
   *           },
   *           b: 'Else case value',
   *         },
   *       }
   *     }
   *   ]
   * }
   * ```
   */
  parameters?: RocketConfigParameter[]

  /**
   * A resolver map to resolve the rocket's variables.
   *
   * Example:
   * ```ts
   * {
   *   variablesResolver: {
   *     '{{BRAVE_API_KEY}}': '$input-BRAVE_API_KEY',
   *
   *     // If not disabled, load context from `fuel:instruct_memory-bank-load.md`
   *     '{{MEMORY_BANK_LOAD}}': {
   *       type: 'match',
   *       a: '$confirm-MEMORY_BANK_LOAD-disabled',
   *       b: false,
   *       result: 'fuel:instruct_memory-bank-load.md',
   *     }
   *   }
   * }
   * ```
   */
  variablesResolver?: RocketConfigVariablesResolver

  /**
   * A resolver map to dynamically build files.
   *
   * Files built by this resolver will be processed as if it's a frame file.
   *
   * These files will assembled AFTER the normal frame files, so it will take priority upon merge/overwrite.
   *
   * Example:
   * ```ts
   * {
   *   filesBuildResolver: {
   *     'brave-search-mcp': {
   *       filePath: '.roo/mcp.json',
   *       content: 'fuel:brave-search-mcp.json',
   *     },
   *   }
   * }
   * ```
   */
  filesBuildResolver?: RocketConfigFilesBuilderResolver

  /**
   * A resolver map to resolve the rocket's file excludes.
   */
  excludesResolver?: { [filePath: string]: RocketResolvable<true> }
}

export function defineRocketConfig<RC extends RocketConfig>(config: RC): RC {
  return config
}

export async function loadRocketConfig(configOrPath: RocketConfig | string) {
  const { config } = typeof configOrPath === 'string'
    ? await loadConfig({
      name: 'rocket',
      cwd: dirname(configOrPath),
      configFile: configOrPath,
    })
    : { config: configOrPath }

  assertsRocketConfig(config)

  return config
}

export interface ParseRocketConfigHooks extends Hooks {
  /**
   * `parameter` and `resolvedParameters` are mutable, the resolver fn will not be called for parameters that already has a resolved value.
   */
  onParameter: (props: {
    parameter: RocketConfigParameter
    resolvedParameters: Record<string, string | boolean>
  }) => void | Promise<void>

  /**
   * `variableResolver` and `resolvedVariables` are mutable, the resolver fn will not be called for variables that already has a resolved value.
   */
  onVariableResolver: (props: {
    variableResolver: [variableName: string, resolverValue: string | RocketResolvable<string>]
    resolvedVariables: Record<string, RocketResolvableString>
  }) => void | Promise<void>

  /**
   * `fileBuildResolver` and `resolvedFilesBuilder` are mutable, the resolver fn will not be called for files that already has a resolved value.
   */
  onFileBuildResolver: (props: {
    fileBuildResolver: [builderKey: string, builderConfig: RocketConfigFilesBuilderResolver[string]]
    resolvedFilesBuilder: Record<string, { filePath: string, content: RocketResolvableString }>
  }) => void | Promise<void>

  /**
   * `excludeResolver` and `resolvedExcludes` are mutable, the resolver fn will not be called for excludes that already has a resolved value.
   */
  onExcludeResolver: (props: {
    excludeResolver: [excludeName: string, resolverValue: boolean | RocketResolvable<true>]
    resolvedExcludes: Record<string, boolean>
  }) => void | Promise<void>
}

export interface ParseRocketConfigOptions {
  /**
   * A hookable instance to hook into the rocket config parsing (and related) process.
   */
  hookable?: Hookable<ParseRocketConfigHooks>
}
export async function parseRocketConfig(configOrPath: RocketConfig | string, options?: ParseRocketConfigOptions) {
  const {
    hookable,
  } = options ?? {}

  const config = await loadRocketConfig(configOrPath)

  const resolvedParameters: Record<string, string | boolean> = {}
  for (const parameter of config.parameters ?? []) {
    if (hookable)
      await hookable.callHook('onParameter', { parameter, resolvedParameters })

    resolvedParameters[parameter.id] = resolvedParameters[parameter.id] ?? await resolveParameter(parameter, resolvedParameters)
  }

  const _injectPossibleParameter = (result: string) => typeof resolvedParameters[result] === 'string' ? resolvedParameters[result] : result

  const resolvedVariables: Record<string, RocketResolvableString> = {}
  for (const variableResolver of Object.entries(config.variablesResolver ?? {})) {
    if (hookable)
      await hookable.callHook('onVariableResolver', { variableResolver, resolvedVariables })

    const [variableName, resolverValue] = variableResolver

    resolvedVariables[variableName] = _injectPossibleParameter(
      resolvedVariables[variableName] ?? resolveVariable(resolverValue, resolvedParameters),
    )
  }

  const resolvedFilesBuilder: Record<string, { filePath: string, content: RocketResolvableString }> = {}
  for (const fileBuildResolver of Object.entries(config.filesBuildResolver ?? {})) {
    if (hookable)
      await hookable.callHook('onFileBuildResolver', { fileBuildResolver, resolvedFilesBuilder })

    const [builderKey, builderConfig] = fileBuildResolver

    resolvedFilesBuilder[builderKey] = resolvedFilesBuilder[builderKey] ?? {
      filePath: builderConfig.filePath,
      content: resolveVariable(builderConfig.content, resolvedParameters), // Re-use resolveVariable logic
    }
    resolvedFilesBuilder[builderKey].content = _injectPossibleParameter(resolvedFilesBuilder[builderKey].content)
  }

  const resolvedExcludes: Record<string, boolean> = {}
  for (const excludeResolver of Object.entries(config.excludesResolver ?? {})) {
    if (hookable)
      await hookable.callHook('onExcludeResolver', { excludeResolver, resolvedExcludes })

    const [excludeName, resolverValue] = excludeResolver

    resolvedExcludes[excludeName] = resolvedExcludes[excludeName] ?? resolveExclude(resolverValue, resolvedParameters)
  }

  return { config, resolvedParameters, resolvedVariables, resolvedExcludes, resolvedFilesBuilder }
}

export function assertsRocketConfig(config: UserInputConfig | RocketConfig): asserts config is RocketConfig {
  // Validate parameters array
  if (config.parameters) {
    if (!Array.isArray(config.parameters))
      throw new Error('Invalid RocketConfig: "parameters" must be an array.')
    // Call assertion for each parameter
    config.parameters.forEach(assertsRocketParameter)
  }

  // Validate variablesResolver object
  if (config.variablesResolver)
    assertsRocketVariablesResolver(config.variablesResolver)

  // Validate filesBuildResolver object
  if (config.filesBuildResolver)
    assertsRocketFilesBuildResolver(config.filesBuildResolver)

  // Validate excludesResolver object
  if (config.excludesResolver)
    assertsRocketExcludesResolver(config.excludesResolver)
}

export async function resolveParameterOperationPrompt(resolver: RocketConfigParameterResolverOperationPrompt): Promise<string | boolean> {
  // Yea the switch case is identical I know, switch case here is necessary for type-safety and avoid `as` casting
  switch (resolver.type) {
    case 'text':
      return await consola.prompt(resolver.label, { ...objectPick(resolver, ['initial', 'type', 'label']), cancel: 'reject' })
    case 'confirm':
      return await consola.prompt(resolver.label, { ...objectPick(resolver, ['initial', 'type', 'label']), cancel: 'reject' })
  }
}

/** Evaluates a simple condition */
export function evaluateCondition(
  type: RocketResolvableType,
  a: string | boolean | null | undefined,
  b: string | boolean | null | undefined,
): boolean {
  switch (type) {
    case 'match':
      return a === b
    case 'contain':
      if (typeof a !== 'string' || typeof b !== 'string')
        throw new Error('"a" and "b" must be string under "contain" resolvable')
      return a.includes(b)
    case 'not':
      return a !== b
    default:
      throw new Error('Unexpected resolvable type')
  }
}

/**
 * Recursively resolves a resolvable input (parameter ID, nested resolvable, or literal)
 * to its final value (string or boolean).
 */
export function resolveResolvableInput<R extends RocketResolvable>(
  input: R | RocketConfigParameter['id'] | string | boolean | undefined,
  resolvedParameters: Record<string, string | boolean>,
  resultFallback: InferResolvableResult<R>,
): string | boolean {
  if (input === undefined) {
    throw new Error('Condition input cannot be undefined')
  }

  // Handle literal boolean
  if (typeof input === 'boolean') {
    return input
  }

  // Handle literal string or parameter ID
  if (typeof input === 'string') {
    const paramValue = resolvedParameters[input]
    return paramValue !== undefined ? paramValue : input // Return parameter value or literal string
  }

  // Handle nested RocketResolvable
  // Note: We pass the *nested* resolvable to resolveRocketResolvable
  return resolveRocketResolvable(input, resolvedParameters, resultFallback) as InferResolvableResult<R> & {}
}

export type InferResolvableResult<R extends RocketResolvable> = R extends RocketResolvable<infer T> ? T : never

/**
 * Resolves a RocketResolvable
 */
export function resolveRocketResolvable<R extends RocketResolvable>(
  resolvable: R,
  resolvedParameters: Record<string, string | boolean>,
  resultFallback?: InferResolvableResult<R>,
): InferResolvableResult<R> {
  // Resolve inputs 'a' and 'b' recursively
  const valueA = resolveResolvableInput(resolvable.a, resolvedParameters, resultFallback || true)
  const valueB = resolveResolvableInput(resolvable.b, resolvedParameters, resultFallback || true)

  switch (resolvable.type) {
    case 'format': {
      return replaceMap(resolvable.result as string, {
        '{a}': String(valueA),
        '{b}': String(valueB),
      }) as InferResolvableResult<R>
    }
    case '$or': {
      return (valueA || valueB) as InferResolvableResult<R>
    }
    default: { // Handles boolean conditions like 'match', 'contain', 'not'
      const conditionMet = evaluateCondition(resolvable.type, valueA, valueB)
      // Callers handle the fallback for falsy conditions (e.g., || '', || false)
      return (conditionMet ? resolvable.result ?? resultFallback : false) as InferResolvableResult<R>
    }
  }
}

export async function resolveParameter(
  parameter: RocketConfigParameter,
  resolvedParameters: Record<string, string | boolean>,
): Promise<string | boolean> {
  switch (parameter.resolver.operation) {
    case 'prompt':
      return await resolveParameterOperationPrompt(parameter.resolver)
    case 'resolvable':
      return resolveRocketResolvable(parameter.resolver.resolvable, resolvedParameters, true) || false
  }
}

/**
 * Resolves a `variable` based on its resolvable.
 * Assumes the resolvable structure and result type have been pre-validated.
 */
export function resolveVariable(
  resolverValue: string | RocketResolvable<string>,
  resolvedParameters: Record<string, string | boolean>,
): string {
  // If the resolver value is already a string, return it directly
  if (typeof resolverValue === 'string')
    return resolverValue

  // If it's a resolvable object, resolve it
  return resolveRocketResolvable(resolverValue, resolvedParameters) || ''
}

/**
 * Resolves an `exclude` based on its resolvable.
 * Assumes the resolvable structure and result type have been pre-validated.
 */
export function resolveExclude(
  resolverValue: boolean | RocketResolvable<true>,
  resolvedParameters: Record<string, string | boolean>,
): boolean {
  // If the resolver value is already a boolean, return it directly
  if (typeof resolverValue === 'boolean')
    return resolverValue

  // If it's a resolvable object, resolve it
  return resolveRocketResolvable(resolverValue, resolvedParameters, true) || false
}

export function assertsRocketParameter(parameter: RocketConfigParameter): asserts parameter is RocketConfigParameter {
  if (
    typeof parameter?.id !== 'string'
    || assertsRocketParameterResolver(parameter.resolver)
  ) {
    throw new Error('Invalid parameter')
  }
}

export function assertsRocketParameterResolver(resolver: RocketConfigParameterResolver): asserts resolver is RocketConfigParameterResolver {
  if (
    !['prompt', 'resolvable'].includes(resolver?.operation)
  )
    throw new Error(`Invalid parameter resolver operation: '${resolver.operation}'`)

  switch (resolver.operation) {
    case 'prompt': {
      if (
        !['text', 'confirm'].includes(resolver.type)
      )
        throw new Error(`Invalid parameter resolver type: '${resolver.type}'`)

      break
    }

    case 'resolvable': {
      assertsRocketResolvable(resolver.resolvable)

      break
    }
  }
}

export function assertsRocketVariablesResolver(resolver: NonNullable<RocketConfig['variablesResolver']>): asserts resolver is NonNullable<RocketConfig['variablesResolver']> {
  for (const [key, value] of Object.entries(resolver)) {
    if (typeof key !== 'string')
      throw new Error(`Invalid variable resolver key`)

    // Value must be a string OR a valid RocketResolvable object
    if (typeof value !== 'string') {
      assertsRocketResolvable(value)

      if (value.type === '$or') {
        if (value.result)
          throw new TypeError(`Invalid variable resolver for "${key}": 'result' is not allowed for '$or' type.`)
      }
      else {
        if (typeof value.result !== 'string') {
          throw new TypeError(`Invalid variable resolver for "${key}": 'result' must be of type string, got ${typeof value.result}.`)
        }
      }
    }
  }
}

export function assertsRocketFilesBuildResolver(resolver: NonNullable<RocketConfig['filesBuildResolver']>): asserts resolver is NonNullable<RocketConfig['filesBuildResolver']> {
  for (const [key, value] of Object.entries(resolver)) {
    if (
      typeof key !== 'string'
      || typeof value?.filePath !== 'string'
    ) {
      throw new TypeError(`Invalid filesBuildResolver entry for key "${key}"`)
    }

    // Value must be a string OR a valid RocketResolvable object
    if (typeof value.content !== 'string') {
      assertsRocketResolvable(value.content)

      // Also ensure the resolvable's result is specifically a string
      if (typeof value.content.result !== 'string') {
        throw new TypeError(`Invalid filesBuildResolver entry for "${key}": 'result' must be of type string, got ${typeof value.content.result}.`)
      }
    }
  }
}

export function assertsRocketExcludesResolver(resolver: NonNullable<RocketConfig['excludesResolver']>): asserts resolver is NonNullable<RocketConfig['excludesResolver']> {
  for (const [key, value] of Object.entries(resolver)) {
    if (typeof key !== 'string')
      throw new Error(`Invalid exclude resolver key`)

    assertsRocketResolvable(value)

    // Ensure the resolvable type is not 'format' for excludes
    // Cast to RocketResolvable to bypass stricter type inference within this check
    if ((value as RocketResolvable).type === 'format')
      throw new TypeError(`Invalid exclude resolver for "${key}": Condition type 'format' is not allowed here.`)
  }
}

export function assertsRocketResolvable(resolvable: RocketResolvable): asserts resolvable is RocketResolvable {
  if (!['match', 'contain', 'not', 'format', '$or'].includes(resolvable.type))
    throw new Error(`Invalid parameter resolver resolvable type: '${resolvable.type}'`)

  if (resolvable.a === undefined)
    throw new Error('Invalid RocketResolvable: Missing required property "a" (or deprecated "subject").')
  if (typeof resolvable.a !== 'string')
    assertsRocketResolvable(resolvable.a) // Recursively validate nested resolvable

  if (resolvable.b === undefined)
    throw new Error('Invalid RocketResolvable: Missing required property "b" (or deprecated "condition").')
  if (typeof resolvable.b !== 'string' && typeof resolvable.b !== 'boolean')
    assertsRocketResolvable(resolvable.b) // Recursively validate nested resolvable

  // `format` resolvable requires a string result
  if (resolvable.type === 'format' && typeof resolvable.result !== 'string')
    throw new TypeError(`Invalid parameter resolver resolvable type 'format': Expected string "result" property.`)

  // Allow result to be undefined for conditions used purely for boolean logic (e.g., in parameters)
  if (resolvable.result !== undefined && typeof resolvable.result !== 'string' && typeof resolvable.result !== 'boolean')
    throw new Error(`Invalid parameter resolver resolvable result: Expected string or boolean, got ${typeof resolvable.result}`)
}

/**
 * Parses a simple Record `variables` and replace `FuelReference`s with its content.
 *
 * Does not mutate the original object
 */
export async function supplyFuel(variables: Record<string, string>, fuelDir: string): Promise<Record<string, string>> {
  return await supplyFuelAsInstructed(variables, fuelDir, async ({ subject, resolveFuelContent }) => {
    const fueledVariables: Record<string, string> = {}
    for (const key in subject) {
      if (subject[key].startsWith('fuel:')) {
        const referencedFuelName = subject[key].slice(5)
        const fuelContent = await resolveFuelContent(referencedFuelName)
        fueledVariables[key] = fuelContent
      }
    }

    return { ...subject, ...fueledVariables }
  })
}

/**
 * Parses a `resolvedFilesBuilder` and replace `FuelReference`s with its content.
 *
 * Does not mutate the original object
 */
export async function supplyFuelToResolvedFilesBuilder(resolvedFilesBuilder: Record<string, { filePath: string, content: RocketResolvableString }>, fuelDir: string) {
  return await supplyFuelAsInstructed(resolvedFilesBuilder, fuelDir, async ({ subject, resolveFuelContent }) => {
    const fueledFilesBuilder: Record<string, { filePath: string, content: string }> = {}
    for (const [key, value] of Object.entries(subject)) {
      if (typeof value.content.startsWith('fuel:')) {
        const referencedFuelName = value.content.slice(5)
        const fuelContent = await resolveFuelContent(referencedFuelName)
        fueledFilesBuilder[key] = { filePath: value.filePath, content: fuelContent }
      }
    }

    return { ...subject, ...fueledFilesBuilder }
  })
}

export async function supplyFuelAsInstructed<S>(
  subject: S,
  fuelDir: string,
  supplyFn: (args: { subject: S, resolveFuelContent: (fuelName: string) => Promise<string> }) => Promise<S>,
): Promise<S> {
  const resolveFuelContent = (fuelName: string) => readFile(resolve(fuelDir, fuelName), 'utf8')
  return await supplyFn({ subject, resolveFuelContent })
}
