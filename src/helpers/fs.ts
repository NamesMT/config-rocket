import type { Hookable } from 'hookable'
import type { ReactiveArgs } from '~/types'
import { mkdir, writeFile } from 'node:fs/promises'
import { dirname } from 'pathe'

export interface FileOutputHooks {
  onFileOutput: (args: ReactiveArgs<{
    filePath: string
    data: string
  }>) => void | Promise<void>
}

export interface FileOutputOptions {
  /**
   * A hookable instance to hook into the file output process.
   */
  hookable?: Hookable<FileOutputHooks>
}

/**
 * Utility to help write a file, with hooks, merging and additional goodies
 *
 * @param filePath The file path to write to
 * @param data The data to write
 * @param options {@link FileOutputOptions}
 */
export async function fileOutput(filePath: string, data: string, options?: FileOutputOptions) {
  const {
    hookable,
  } = options ?? {}

  const state = {
    filePath,
    data,
  }

  if (hookable)
    await hookable.callHook('onFileOutput', state)

  // Optimistically create the directory
  await mkdir(dirname(state.filePath), { recursive: true })

  // Write the file
  return await writeFile(state.filePath, state.data)
}
