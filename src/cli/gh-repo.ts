import consola from 'consola'

export interface GhReleaseAsset {
  name: string
  browser_download_url: string
  download_count: number
  [key: string]: any
}

export async function getValidGhRepoReleaseAssets(owner: string, name: string) {
  const res = await fetch(`https://api.github.com/repos/${owner}/${name}/releases/latest`)
  if (!res.ok)
    throw new Error(`Failed to fetch repo's release metadata: ${res.statusText}`)

  const release: any = (await res.json())

  return ((release.assets ?? []) as GhReleaseAsset[]).filter(a => a.content_type === 'application/zip')
}

export async function promptSelectGhAsset(assets: GhReleaseAsset[]) {
  const selectedAssetIndex = Number(await consola.prompt(`Found ${assets.length} available zip archives, select one:`, {
    cancel: 'reject',
    type: 'select',
    options: assets.map((asset, index) => ({
      label: `${asset.name} (${asset.download_count} downloads)`,
      value: String(index),
    })),
  }))

  return assets[selectedAssetIndex]
}
