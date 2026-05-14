import { describe, expect, test } from "bun:test"
import path from "path"

const root = path.resolve(import.meta.dirname, "../..")

describe("postinstall binary setup hardening", () => {
  test("uses atomic replacement and darwin codesign repair for cached launcher binary", async () => {
    const script = await Bun.file(path.join(root, "script/postinstall.mjs")).text()

    expect(script).toContain(".wiscode-cli.tmp")
    expect(script).toContain("renameSync")
    expect(script).toContain("codesign")
    expect(script).toContain("--verify")
    expect(script).toContain('"--sign", "-"')
  })
})
