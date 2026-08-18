import { describe, expect, test } from "bun:test"

describe("logo branding", () => {
  test("mark does not use upstream square glyph", async () => {
    const source = await Bun.file(new URL("./logo.tsx", import.meta.url)).text()
    expect(source).not.toContain('d="M12 4H4V16H12V4ZM16 20H0V0H16V20Z"')
  })

  test("v2 wordmark uses WisCode branding", async () => {
    const source = await Bun.file(new URL("../v2/components/wordmark-v2.tsx", import.meta.url)).text()
    expect(source).toContain('data-brand="wiscode"')
    expect(source).toContain("WISCODE")
    expect(source).not.toContain("M55.3846 36.4286H18.4615")
  })
})
