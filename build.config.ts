import { defineBuildConfig } from 'unbuild'
import sharedConfig from './shared.config'

export default defineBuildConfig({
  entries: [
    // Main engine
    'src/index',

    // CLI-specific functions
    'src/cli',

    // CLI app
    {
      input: 'src/cli-entry',
      declaration: false,
    },
  ],
  declaration: 'node16',
  clean: true,
  rollup: {
    inlineDependencies: true,
    esbuild: {
      target: 'esnext',
      // minify: true,
    },
  },
  ...sharedConfig,
})
