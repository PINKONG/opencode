import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const menu = await Bun.file(join(dir, "..", "..", "..", "app", "src", "desktop-menu.ts")).text()
const renderer = await Bun.file(join(dir, "..", "renderer", "index.tsx")).text()

describe("desktop menu cli entry", () => {
  test("exposes install cli in the mac application menu", () => {
    expect(menu).toContain('labelKey: "desktop.menu.installCli"')
    expect(menu).toContain('command: "install-cli"')
  })

  test("routes install-cli menu commands to the desktop cli installer", () => {
    expect(renderer).toContain('if (id === "install-cli")')
    expect(renderer).toContain("void installCli()")
  })

  test("exposes sidecar LAN settings APIs to the app platform", () => {
    expect(renderer).toContain("getSidecarLanConfig: () => window.api.getSidecarLanConfig()")
    expect(renderer).toContain("await window.api.setSidecarLanConfig(config)")
    expect(renderer).toContain("getSidecarLanStatus: () => window.api.getSidecarLanStatus()")
  })
})
