import { describe, expect, test } from "bun:test"

describe("avatar styles", () => {
  test("uses sans font for fallback initials to keep CJK glyph coverage", async () => {
    const css = await Bun.file(new URL("./avatar.css", import.meta.url)).text()
    expect(css).toContain("font-family: var(--font-family-sans);")
    expect(css).not.toContain("font-family: var(--font-mono);")
  })
})
