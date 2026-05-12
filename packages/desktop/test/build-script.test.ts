import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const macFile = join(dir, "../../../script/build-desktop-prod-mac.sh")
const windowsFile = join(dir, "../../../script/build-desktop-prod-windows.ps1")
const macScript = await Bun.file(macFile).text()
const windowsScript = await Bun.file(windowsFile).text()

describe("mac desktop build script", () => {
  test("copies wiscode sidecar into electron resources", () => {
    expect(macScript).toContain('mkdir -p resources')
    expect(macScript).toContain('cp "${bin}" "resources/wiscode-cli"')
    expect(macScript).toContain('chmod +x "resources/wiscode-cli"')
  })

  test("packages with electron-builder in prod channel", () => {
    const channelIndex = macScript.indexOf("export OPENCODE_CHANNEL=prod")
    const versionIndex = macScript.indexOf(
      'export OPENCODE_VERSION="$(bun --print \'require(\"./packages/opencode/package.json\").version\')"',
    )
    const buildIndex = macScript.indexOf('echo "==> build sidecar"')
    expect(channelIndex).toBeGreaterThan(-1)
    expect(versionIndex).toBeGreaterThan(-1)
    expect(buildIndex).toBeGreaterThan(-1)
    expect(channelIndex).toBeLessThan(buildIndex)
    expect(versionIndex).toBeLessThan(buildIndex)
    expect(macScript).toContain('./node_modules/.bin/electron-builder --mac --config electron-builder.config.ts')
    expect(macScript).not.toContain("bun run tauri")
    expect(macScript).not.toContain("tauri.prod.conf.json")
  })

  test("passes the release version into the windows sidecar build too", () => {
    const channelIndex = windowsScript.indexOf('$env:OPENCODE_CHANNEL = "prod"')
    const versionIndex = windowsScript.indexOf(
      '$env:OPENCODE_VERSION = & bun --print \'require("./packages/opencode/package.json").version\'',
    )
    const buildIndex = windowsScript.indexOf('Write-Host "==> build sidecar"')
    expect(channelIndex).toBeGreaterThan(-1)
    expect(versionIndex).toBeGreaterThan(-1)
    expect(buildIndex).toBeGreaterThan(-1)
    expect(channelIndex).toBeLessThan(buildIndex)
    expect(versionIndex).toBeLessThan(buildIndex)
  })
})
