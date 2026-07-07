import { expect, test } from "bun:test"

test("WSL onboarding text uses WisCode product name", async () => {
  const english = await Bun.file(new URL("../i18n/en.ts", import.meta.url)).text()

  expect(english).toContain('"wsl.onboarding.distroStatus.opencodeMissing": "WisCode not installed"')
  expect(english).not.toContain("OpenCode not installed")
})
