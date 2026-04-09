import { describe, expect, test } from "bun:test"

describe("DialogConnectProvider", () => {
  test("does not link to opencode zen", async () => {
    const text = await Bun.file(new URL("./dialog-connect-provider.tsx", import.meta.url)).text()
    expect(text).not.toContain("https://opencode.ai/zen")
  })
})
