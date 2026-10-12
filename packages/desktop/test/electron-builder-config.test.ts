import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../electron-builder.config.ts")
const hooksFile = join(dir, "../resources/nsis-installer.nsh")
const config = await Bun.file(file).text()
const hooks = await Bun.file(hooksFile).text()

describe("electron builder config", () => {
  test("does not point updater at upstream opencode releases", () => {
    expect(config).not.toContain('owner: "anomalyco"')
    expect(config).toContain('provider: "generic"')
    expect(config).toContain('url: "https://cloud.morewis.com/api/frontend/wiscode/updates/beta"')
    expect(config).toContain('url: "https://cloud.morewis.com/api/frontend/wiscode/updates/prod"')
  })

  test("keeps branded nsis installer wiring", () => {
    expect(config).toContain('installerIcon: `resources/icons/icon.ico`')
    expect(config).toContain('installerHeaderIcon: `resources/icons/icon.ico`')
    expect(config).toContain('include: "resources/nsis-installer.nsh"')
  })

  test("registers windows cli on post install and cleans on uninstall", () => {
    expect(hooks).toContain("!macro customInstall")
    expect(hooks).toContain("!macro customUnInstall")
    expect(hooks).toContain("wiscode.exe")
    expect(hooks).toContain("HKCU")
    expect(hooks).toContain("$INSTDIR\\resources\\wiscode-cli.exe")
    expect(hooks).toContain("${UnStrTok}")
    expect(hooks).toContain('DeleteRegValue HKCU "Environment" "Path"')
    expect(hooks).toContain('WriteRegExpandStr HKCU "Environment" "Path" "$WisCodePathNew"')
  })

  test("ships both cli and node sidecars", () => {
    expect(config).toContain('filter: ["wiscode-cli", "wiscode-cli.exe", "wiscode-node", "wiscode-node.exe", "rg", "rg.exe", "uv", "uv.exe", "uv-LICENSE-MIT", "bmad/**"]')
    expect(config).toContain('"bmad/**"')
    expect(config).toContain('"uv.exe"')
    expect(config).toContain('"rg", "rg.exe"')
  })
})
