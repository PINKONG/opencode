import type { APIEvent } from "@solidjs/start"
import type { DownloadPlatform } from "../types"

// Doing this on the server lets us preserve the original name for platforms we don't care to rename for
const downloadNames: Record<string, string> = {
  "darwin-aarch64-dmg": "WisCode.dmg",
  "darwin-x64-dmg": "WisCode.dmg",
  "windows-x64-nsis": "WisCode Installer.exe",
} satisfies { [K in DownloadPlatform]?: string }

type ReleaseAsset = {
  name: string
  browser_download_url: string
}

type Release = {
  prerelease?: boolean
  assets?: ReleaseAsset[]
}

const matchers: Record<DownloadPlatform, RegExp[]> = {
  "darwin-aarch64-dmg": [/^WisCode(?: Beta)?_[^_]+_arm64\.dmg$/],
  "darwin-x64-dmg": [/^WisCode(?: Beta)?_[^_]+_x64\.dmg$/],
  "windows-x64-nsis": [/^WisCode(?: Beta)?(?: Setup)? [^ ]+\.exe$/, /^WisCode(?: Beta)?_[^_]+_x64\.exe$/],
  "linux-x64-deb": [/^wiscode(?:-beta)?_[^_]+_amd64\.deb$/i, /^WisCode(?:-Beta)?-[^-]+\.amd64\.deb$/],
  "linux-x64-appimage": [/^WisCode(?:-Beta)?-[^-]+\.AppImage$/],
  "linux-x64-rpm": [/^wiscode(?:-beta)?-[^-]+\.x86_64\.rpm$/i, /^WisCode(?:-Beta)?-[^-]+\.x86_64\.rpm$/],
}

async function latestRelease(channel: string) {
  const releases = await fetch("https://api.github.com/repos/PINKONG/opencode/releases", {
    headers: {
      Accept: "application/vnd.github+json",
    },
  })
  if (!releases.ok) return
  const list = (await releases.json()) as Release[]
  return list.find((item) => Boolean(item.prerelease) === (channel !== "stable"))
}

function resolveAsset(platform: DownloadPlatform, assets: ReleaseAsset[]) {
  return assets.find((asset) => matchers[platform].some((pattern) => pattern.test(asset.name)))
}

export async function GET({ params: { platform, channel } }: APIEvent) {
  const release = await latestRelease(channel)
  const asset = release?.assets ? resolveAsset(platform as DownloadPlatform, release.assets) : undefined
  if (!asset) return new Response(null, { status: 404 })

  const resp = await fetch(asset.browser_download_url)

  const downloadName = downloadNames[platform]

  const headers = new Headers(resp.headers)
  if (downloadName) headers.set("content-disposition", `attachment; filename="${downloadName}"`)

  return new Response(resp.body, { status: resp.status, statusText: resp.statusText, headers })
}
