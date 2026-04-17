import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../../../script/build-desktop-prod-mac.sh")
const script = await Bun.file(file).text()

describe("mac desktop build script", () => {
  test("checks rust toolchain before tauri bundling", () => {
    expect(script).toContain("if ! command -v cargo >/dev/null 2>&1; then")
    expect(script).toContain("Missing cargo in PATH. Install the Rust toolchain first.")
    expect(script).toContain("if ! command -v rustc >/dev/null 2>&1; then")
    expect(script).toContain("Missing rustc in PATH. Install the Rust toolchain first.")
  })

  test("cleans stale dmg artifacts before tauri bundling", () => {
    expect(script).toContain('macos_bundle="${root}/packages/desktop/src-tauri/target/release/bundle/macos"')
    expect(script).toContain('if [[ -d "${macos_bundle}" ]]; then')
    expect(script).toContain('find "${macos_bundle}" -maxdepth 1')
    expect(script).toContain("-name 'WisCode*.dmg'")
    expect(script).toContain("-name 'rw.*.dmg'")
    expect(script).toContain("-delete")
  })
})
