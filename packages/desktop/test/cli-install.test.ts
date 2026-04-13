import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../src-tauri/src/cli.rs")
const src = await Bun.file(file).text()

describe("tauri cli install path", () => {
  test("installs wiscode into the wiscode namespace", () => {
    expect(src).toContain('const CLI_INSTALL_DIR: &str = ".wiscode/bin";')
    expect(src).toContain(".wiscode/bin/wiscode")
    expect(src).not.toContain(".opencode/bin")
  })
})
