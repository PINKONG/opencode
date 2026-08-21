import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const cfg = await Bun.file(join(dir, "../../electron-builder.config.ts")).text()
const vite = await Bun.file(join(dir, "../../electron.vite.config.ts")).text()
const main = await Bun.file(join(dir, "index.ts")).text()
const server = await Bun.file(join(dir, "server.ts")).text()
const migrate = await Bun.file(join(dir, "migrate.ts")).text()
const menu = await Bun.file(join(dir, "menu.ts")).text()
const pkg = await Bun.file(join(dir, "../../package.json")).text()
const windows = await Bun.file(join(dir, "windows.ts")).text()
const renderer = await Bun.file(join(dir, "../renderer/index.tsx")).text()

describe("electron branding", () => {
  test("copies embedded web ui runtime assets from opencode node dist without duplicating node entrypoints", () => {
    expect(vite).toContain('name: "opencode:copy-server-assets"')
    expect(vite).toContain('const ignored = new Set(["node.js", "node.js.map"])')
    expect(vite).toContain("if (ignored.has(l)) continue")
    expect(vite).not.toContain('if (!l.endsWith(".wasm")) continue')
  })

  test("uses wiscode identity in build config", () => {
    expect(cfg).toContain('artifactName: "${productName}_${version}_${arch}.${ext}"')
    expect(cfg).toContain('name: "WisCode"')
    expect(cfg).toContain('schemes: ["wiscode"]')
    expect(cfg).toContain('dev: "ai.wiscode.desktop.dev"')
    expect(cfg).toContain('beta: "ai.wiscode.desktop.beta"')
    expect(cfg).toContain('prod: "ai.wiscode.desktop"')
    expect(cfg).toContain("const appId = APP_IDS[channel]")
    expect(cfg).toContain("appId,")
    expect(cfg).toContain('productName: "WisCode Dev"')
    expect(cfg).toContain('productName: "WisCode Beta"')
    expect(cfg).toContain('productName: "WisCode"')
    expect(cfg).toContain('provider: "generic"')
    expect(cfg).toContain('url: "https://cloud.morewis.com/api/frontend/wiscode/updates/beta"')
    expect(cfg).toContain('url: "https://cloud.morewis.com/api/frontend/wiscode/updates/prod"')
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
    expect(main).not.toContain('process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"')
    expect(main).not.toContain("opencode://")
    expect(main).not.toContain("OpenCode")
  })

  test("keeps embedded web ui enabled for sidecar branding", () => {
    expect(main).not.toContain('process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"')
  })

  test("uses wiscode identity in migrate, menu, windows, and renderer", () => {
    expect(migrate).toContain('dev: "ai.wiscode.desktop.dev"')
    expect(migrate).toContain('beta: "ai.wiscode.desktop.beta"')
    expect(migrate).toContain('prod: "ai.wiscode.desktop"')
    expect(migrate).not.toContain("ai.opencode.desktop")
    expect(menu).not.toContain("OpenCode")
    expect(windows).toContain('title: "WisCode"')
    expect(windows).not.toContain("OpenCode failed to load")
    expect(windows).not.toContain("OpenCode window terminated unexpectedly")
    expect(windows).not.toContain("OpenCode is not responding")
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
