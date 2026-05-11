import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const cfg = await Bun.file(join(dir, "../../electron-builder.config.ts")).text()
const main = await Bun.file(join(dir, "index.ts")).text()
const server = await Bun.file(join(dir, "server.ts")).text()
const migrate = await Bun.file(join(dir, "migrate.ts")).text()
const menu = await Bun.file(join(dir, "menu.ts")).text()
const pkg = await Bun.file(join(dir, "../../package.json")).text()
const windows = await Bun.file(join(dir, "windows.ts")).text()
const renderer = await Bun.file(join(dir, "../renderer/index.tsx")).text()

describe("electron branding", () => {
  test("uses wiscode identity in build config", () => {
    expect(cfg).toContain('artifactName: "wiscode-electron-${os}-${arch}.${ext}"')
    expect(cfg).toContain('name: "WisCode"')
    expect(cfg).toContain('schemes: ["wiscode"]')
    expect(cfg).toContain('appId: "ai.wiscode.desktop.dev"')
    expect(cfg).toContain('appId: "ai.wiscode.desktop.beta"')
    expect(cfg).toContain('appId: "ai.wiscode.desktop"')
    expect(cfg).toContain('productName: "WisCode Dev"')
    expect(cfg).toContain('productName: "WisCode Beta"')
    expect(cfg).toContain('productName: "WisCode"')
    expect(cfg).toContain('owner: "PINKONG"')
    expect(cfg).toContain('repo: "opencode"')
    expect(cfg).toContain("wiscode-node")
    expect(cfg).not.toContain("anomalyco")
    expect(cfg).not.toContain('schemes: ["opencode"]')
  })

  test("uses wiscode identity in the main process", () => {
    expect(main).toContain('dev: "WisCode Dev"')
    expect(main).toContain('beta: "WisCode Beta"')
    expect(main).toContain('prod: "WisCode"')
    expect(main).toContain('dev: "ai.wiscode.desktop.dev"')
    expect(main).toContain('beta: "ai.wiscode.desktop.beta"')
    expect(main).toContain('prod: "ai.wiscode.desktop"')
    expect(main).toContain('app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "WisCode Dev")')
    expect(main).toContain('"wiscode://"')
    expect(main).toContain('app.setAsDefaultProtocolClient("wiscode")')
    expect(main).not.toContain("opencode://")
    expect(main).not.toContain("OpenCode")
  })

  test("uses wiscode identity in migrate, menu, windows, and renderer", () => {
    expect(migrate).toContain('dev: "ai.wiscode.desktop.dev"')
    expect(migrate).toContain('beta: "ai.wiscode.desktop.beta"')
    expect(migrate).toContain('prod: "ai.wiscode.desktop"')
    expect(migrate).not.toContain("ai.opencode.desktop")
    expect(menu).toContain('label: "WisCode"')
    expect(menu).toContain('label: "WisCode Repository"')
    expect(menu).toContain("github.com/PINKONG/opencode")
    expect(menu).not.toContain("discord.com/invite/opencode")
    expect(menu).not.toContain("OpenCode")
    expect(windows).toContain('title: "WisCode"')
    expect(server).toContain("WISCODE_BUNDLED_NODE_PATH")
    expect(renderer).toContain('const deepLinkEvent = "wiscode:deep-link"')
    expect(renderer).not.toContain('const deepLinkEvent = "opencode:deep-link"')
  })

  test("uses wiscode package metadata", () => {
    expect(pkg).toContain('"homepage": "https://github.com/PINKONG/opencode"')
    expect(pkg).toContain('"name": "WisCode"')
    expect(pkg).not.toContain('"homepage": "https://opencode.ai"')
    expect(pkg).not.toContain('"name": "OpenCode"')
  })
})
