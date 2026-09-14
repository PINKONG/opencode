import { expect, test } from "bun:test"

test("keeps the server tab available in the new layout", async () => {
  const source = await Bun.file(new URL("./status-popover-body.tsx", import.meta.url)).text()

  expect(source).toContain('<Tabs.Trigger value="servers"')
  expect(source).toContain('<Tabs.Content value="servers">')
  expect(source).not.toContain("!settings.general.newLayoutDesigns() && (")
  expect(source).toContain("copyServerAccessUrl(language, platform, s)")
})
