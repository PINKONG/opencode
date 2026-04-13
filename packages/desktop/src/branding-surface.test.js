import { describe, expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const read = (path) => readFileSync(join(dir, path), "utf8")

describe("desktop branding surface", () => {
  test("does not expose old brand in visible desktop metadata and links", () => {
    const menu = read("./menu.ts")
    const index = read("./index.tsx")
    const appstream = read("../src-tauri/release/appstream.metainfo.xml")
    const latest = read("../scripts/finalize-latest-json.ts")
    const bundles = read("../scripts/copy-bundles.ts")
    const workflow = read("../../../.github/workflows/publish.yml")

    expect(menu).not.toContain("https://opencode.ai/docs")
    expect(menu).not.toContain("https://discord.com/invite/opencode")
    expect(menu).not.toContain("https://github.com/anomalyco/opencode/issues/new?template=feature_request.yml")
    expect(menu).not.toContain("https://github.com/anomalyco/opencode/issues/new?template=bug_report.yml")
    expect(index).not.toContain("https://opencode.ai/favicon-96x96-v3.png")
    expect(index).toContain('const deepLinkEvent = "wiscode:deep-link"')
    expect(index).not.toContain('const deepLinkEvent = "opencode:deep-link"')
    expect(appstream).not.toContain("OpenCode is an open source agent")
    expect(appstream).not.toContain("https://opencode.ai")
    expect(appstream).not.toContain("https://github.com/anomalyco/opencode")
    expect(latest).toContain('asset: "wiscode-desktop-windows-x64.exe"')
    expect(latest).not.toContain("opencode-desktop-windows-x64.exe")
    expect(bundles).toContain('WisCode*')
    expect(bundles).not.toContain("OpenCode*")
    expect(workflow).toContain("releaseAssetNamePattern: wiscode-desktop-[platform]-[arch][ext]")
    expect(workflow).not.toContain("releaseAssetNamePattern: opencode-desktop-[platform]-[arch][ext]")
  })
})
