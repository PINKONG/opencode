import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../src/main/cli.ts")
const src = await Bun.file(file).text()

describe("desktop cli installation hardening", () => {
  test("uses atomic replacement and darwin codesign repair when installing CLI", () => {
    expect(src).toContain(".tmp")
    expect(src).toContain("renameSync")
    expect(src).toContain("codesign")
    expect(src).toContain("--verify")
    expect(src).toContain('"--sign", "-"')
  })
})
