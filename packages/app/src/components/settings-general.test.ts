import { describe, expect, test } from "bun:test"

describe("SettingsGeneral", () => {
  test("does not link theme settings to opencode docs", async () => {
    const text = await Bun.file(new URL("./settings-general.tsx", import.meta.url)).text()
    expect(text).not.toContain("https://opencode.ai/docs/themes/")
    const textV2 = await Bun.file(new URL("./settings-v2/general.tsx", import.meta.url)).text()
    expect(textV2).not.toContain("https://opencode.ai/docs/themes/")
  })

  test("keeps the desktop sidecar LAN settings section", async () => {
    const text = await Bun.file(new URL("./settings-general.tsx", import.meta.url)).text()
    expect(text).toContain("const SidecarLanSection = () =>")
    expect(text).toContain('data-action="settings-sidecar-lan"')
    expect(text).toContain("<SidecarLanSection />")
    const textV2 = await Bun.file(new URL("./settings-v2/general.tsx", import.meta.url)).text()
    expect(textV2).toContain("const SidecarLanSection = () =>")
    expect(textV2).toContain('data-action="settings-sidecar-lan"')
    expect(textV2).toContain("<SidecarLanSection />")
  })

  test("uses sidecar credentials when showing desktop LAN access URL", async () => {
    const text = await Bun.file(new URL("./settings-general.tsx", import.meta.url)).text()
    expect(text).toContain("buildSidecarLanAccessUrl")
    expect(text).toContain("sidecarLanAccessUrl()")
    expect(text).toContain("status?.accessUrl")
    const textV2 = await Bun.file(new URL("./settings-v2/general.tsx", import.meta.url)).text()
    expect(textV2).toContain("buildSidecarLanAccessUrl")
    expect(textV2).toContain("sidecarLanAccessUrl()")
    expect(textV2).toContain("status?.accessUrl")
  })
})
