import { defineBuildConfig } from 'unbuild'
import sharedConfig from './shared.config'

export default defineBuildConfig({
  declaration: 'node16',
  clean: true,
  externals: ['jiti'],
  rollup: {
    inlineDependencies: true,
    esbuild: {
      target: 'esnext',
      // minify: true,
    },
  },
  ...sharedConfig,
})
