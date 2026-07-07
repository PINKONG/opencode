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
    expect(macScript).toContain('cp "${rg}" "resources/rg"')
    expect(windowsScript).toContain('Copy-Item $rg (Join-Path $resources "rg.exe") -Force')
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
      '$env:OPENCODE_VERSION = (Get-Content (Join-Path $Root "packages\\opencode\\package.json") -Raw | ConvertFrom-Json).version',
    )
    const buildIndex = windowsScript.indexOf('Write-Host "==> build sidecar"')
    expect(channelIndex).toBeGreaterThan(-1)
    expect(versionIndex).toBeGreaterThan(-1)
    expect(buildIndex).toBeGreaterThan(-1)
    expect(channelIndex).toBeLessThan(buildIndex)
    expect(versionIndex).toBeLessThan(buildIndex)
  })

  test("uses resolved bun executable in the windows build script", () => {
    expect(windowsScript).toContain("$Bun = (Get-Command bun -ErrorAction SilentlyContinue).Source")
    expect(windowsScript).toContain('$Bun = Join-Path $HOME ".bun\\bin\\bun.exe"')
    expect(windowsScript).toContain("& $Bun install")
    expect(windowsScript).toContain("& $Bun run package:win")
  })

  test("uses local rcedit on windows to avoid legacy winCodeSign extraction", () => {
    expect(windowsScript).toContain('$rceditSource = Join-Path $Root "node_modules\\.bun\\electron-winstaller@5.4.0\\node_modules\\electron-winstaller\\vendor\\rcedit.exe"')
    expect(windowsScript).toContain('$env:ELECTRON_BUILDER_RCEDIT_PATH = $rceditDir')
  })

  test("raises node heap for windows electron-vite builds without overriding user options", () => {
    expect(windowsScript).toContain("function Ensure-NodeHeap")
    expect(windowsScript).toContain("if ($env:NODE_OPTIONS -match '(^|\\s)--max-old-space-size=')")
    expect(windowsScript).toContain('$env:NODE_OPTIONS = (($env:NODE_OPTIONS, "--max-old-space-size=$SizeMb") -join " ").Trim()')
    expect(windowsScript).toContain("Ensure-NodeHeap")
    expect(windowsScript.indexOf("Ensure-NodeHeap")).toBeLessThan(windowsScript.indexOf('Write-Host "==> build frontend"'))
  })
})
