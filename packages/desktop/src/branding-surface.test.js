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

    expect(menu).not.toContain("https://opencode.ai/docs")
    expect(menu).not.toContain("https://discord.com/invite/opencode")
    expect(menu).not.toContain("https://github.com/anomalyco/opencode/issues/new?template=feature_request.yml")
    expect(menu).not.toContain("https://github.com/anomalyco/opencode/issues/new?template=bug_report.yml")
    expect(index).not.toContain("https://opencode.ai/favicon-96x96-v3.png")
    expect(appstream).not.toContain("OpenCode is an open source agent")
    expect(appstream).not.toContain("https://opencode.ai")
    expect(appstream).not.toContain("https://github.com/anomalyco/opencode")
  })
})
