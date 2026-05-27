import { describe, expect, test } from "bun:test"

describe("SettingsGeneral", () => {
  test("does not link theme settings to opencode docs", async () => {
    const text = await Bun.file(new URL("./settings-general.tsx", import.meta.url)).text()
    expect(text).not.toContain("https://opencode.ai/docs/themes/")
  })

  test("keeps the desktop sidecar LAN settings section", async () => {
    const text = await Bun.file(new URL("./settings-general.tsx", import.meta.url)).text()
    expect(text).toContain("const SidecarLanSection = () =>")
    expect(text).toContain('data-action="settings-sidecar-lan"')
    expect(text).toContain("<SidecarLanSection />")
  })
})
