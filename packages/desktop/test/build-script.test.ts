import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../../../script/build-desktop-prod-mac.sh")
const script = await Bun.file(file).text()

describe("mac desktop build script", () => {
  test("cleans stale dmg artifacts before tauri bundling", () => {
    expect(script).toContain('find "${root}/packages/desktop/src-tauri/target/release/bundle/macos"')
    expect(script).toContain("-name 'WisCode*.dmg'")
    expect(script).toContain("-name 'rw.*.dmg'")
    expect(script).toContain("-delete")
  })
})
