import { defineBuildConfig } from 'unbuild'
import sharedConfig from './shared.config'

export default defineBuildConfig({
  entries: [
    // Main engine
    'src/index',

    // CLI-specific exports
    'src/cli',

    // CLI app
    'src/cli-entry',

    // CLI `rocket-zip` app
    'src/cli-rocket-zip-entry',
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
