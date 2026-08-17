const BASE_URL = "https://cloud.morewis.com/api/frontend/wiscode/updates"

export function getUpdaterFeedURL(
  channel: "beta" | "prod",
  platform: NodeJS.Platform,
  architecture: NodeJS.Architecture,
) {
  const targetPlatform = platform === "win32" ? "windows" : platform === "darwin" ? "macos" : platform === "linux" ? "linux" : undefined
  if (!targetPlatform) throw new Error(`Unsupported updater platform: ${platform}`)
  if (architecture !== "x64" && architecture !== "arm64") {
    throw new Error(`Unsupported updater architecture: ${architecture}`)
  }
  return `${BASE_URL}/${channel}/${targetPlatform}/${architecture}`
}
