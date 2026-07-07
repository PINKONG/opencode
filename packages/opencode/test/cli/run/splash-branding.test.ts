import { describe, expect, test } from "bun:test"
import path from "path"

const sourcePath = path.join(import.meta.dirname, "../../../src/cli/cmd/run/splash.ts")

describe("run splash branding", () => {
  test("uses WisCode branding in entry and exit splash text", async () => {
    const source = await Bun.file(sourcePath).text()

    expect(source).toContain("WisCode")
    expect(source).toContain("wiscode --mini -s")
    expect(source).not.toContain("OpenCode")
    expect(source).not.toContain("opencode --mini -s")
  })
})
