import { defineCommand, runMain } from 'citty'
import { getValidGhRepoReleaseAssets, promptSelectGhAsset } from '~/cli/gh-repo'
import { unpackFromUrl } from '~/cli/unpack'

const main = defineCommand({
  meta: {
    name: 'config-rocket',
    description: 'Config Rocket CLI',
  },
  args: {
    url: {
      type: 'string',
      description: 'The direct URL to the config pack',
    },
    repo: {
      type: 'string',
      description: 'The github repository slug (e.g: NamesMT/roo-rocket)',
    },
  },
  async run({ args }) {
    const { url, repo } = args

    if (!url && !repo)
      throw new Error('`url` or `repo` is required')

    if (url)
      return await unpackFromUrl(url)

    const repoPatternMatch = repo.match(/^([\w-]+)\/([\w-]+)$/)
    if (!repoPatternMatch)
      throw new Error('Invalid repo format, expected "owner/repo-name"')

    const [, owner, name] = repoPatternMatch
    const availableAssets = await getValidGhRepoReleaseAssets(owner, name)
    if (!availableAssets.length)
      throw new Error(`No assets found for "${owner}/${name}"'s latest release`)

    const selectedAsset = await promptSelectGhAsset(availableAssets)

    return await unpackFromUrl(selectedAsset.browser_download_url)
  },
})

runMain(main)
