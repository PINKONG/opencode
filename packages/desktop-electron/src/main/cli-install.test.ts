import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "server.ts")
const src = await Bun.file(file).text()

describe("electron cli install path", () => {
  test("installs wiscode into the wiscode namespace", () => {
    expect(src).toContain('XDG_STATE_HOME: app.getPath("userData")')
    expect(src).toContain('OPENCODE_CLIENT: "desktop"')
    expect(src).toContain("WISCODE_BUNDLED_NODE_PATH")
    expect(src).toContain("resolveBundledNodePath")
    expect(src).toContain('join(app.getAppPath(), "resources", executable)')
  })
})
