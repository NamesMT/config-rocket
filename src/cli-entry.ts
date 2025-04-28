#!/usr/bin/env node

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
      description: 'The github repository slug (e.g: NamesMT/config-packs), will list out available archives from latest release.',
    },
    pack: {
      type: 'string',
      description: 'The config pack name to auto-select from the repo',
    },
    nonAssemblyBehavior: {
      type: 'boolean',
      description: [
        'Control the behavior when encountering non-assembly config packs:',
        '"true": will extract without asking',
        '"false": will abort the process',
        'Default (not specified): will prompt user',
      ].join('\n'),
      default: undefined,
    },
    sha256: {
      type: 'string',
      description: `If specified, will verify the downloaded archive's sha256 hash (base64url)`,
    },
    cwd: {
      type: 'string',
      description: 'The working directory for the process',
    },
  },
  async run({ args }) {
    const {
      url,
      repo,
      pack,
      nonAssemblyBehavior,
      sha256,
      cwd,
    } = args

    if (!url && !repo)
      throw new Error('`url` or `repo` is required')

    if (url) {
      return await unpackFromUrl(url, {
        nonAssemblyBehavior,
        sha256,
        cwd,
      })
    }

    const repoPatternMatch = repo.match(/^([\w-]+)\/([\w-]+)$/)
    if (!repoPatternMatch)
      throw new Error('Invalid repo format, expected "owner/repo-name"')

    const [, owner, name] = repoPatternMatch
    const availableAssets = await getValidGhRepoReleaseAssets(owner, name)
    if (!availableAssets.length)
      throw new Error(`No assets found for "${owner}/${name}"'s latest release`)

    const selectedAsset = pack
      ? availableAssets.find(a => a.name === pack)
      : await promptSelectGhAsset(availableAssets)

    // This is only encountered if user provided a pack name, so error message is specific to it
    if (!selectedAsset)
      throw new Error(`pack "${pack}" is not found in the latest release of "${owner}/${name}"`)

    return await unpackFromUrl(selectedAsset.browser_download_url, {
      nonAssemblyBehavior,
      sha256,
      cwd,
    })
  },
})

runMain(main)
