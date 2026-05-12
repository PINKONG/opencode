import { describe, expect, test } from "bun:test"

describe("logo branding", () => {
  test("mark does not use upstream square glyph", async () => {
    const source = await Bun.file(new URL("./logo.tsx", import.meta.url)).text()
    expect(source).not.toContain('d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z"')
  })
})
