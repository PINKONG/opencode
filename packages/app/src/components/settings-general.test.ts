import { describe, expect, test } from "bun:test"

describe("SettingsGeneral", () => {
  test("does not link theme settings to opencode docs", async () => {
    const text = await Bun.file(new URL("./settings-general.tsx", import.meta.url)).text()
    expect(text).not.toContain("https://opencode.ai/docs/themes/")
  })
})
