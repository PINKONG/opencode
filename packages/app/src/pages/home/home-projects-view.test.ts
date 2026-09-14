import { expect, test } from "bun:test"

test("places the knowledge entry above settings in the home utility navigation", async () => {
  const source = await Bun.file(new URL("./home-projects-view.tsx", import.meta.url)).text()
  const knowledge = source.indexOf('name="maxkb"')
  const settings = source.indexOf('name="settings-gear"')

  expect(knowledge).toBeGreaterThan(-1)
  expect(knowledge).toBeLessThan(settings)
  expect(source).toContain("knowledgeVisible: Accessor<boolean>")
  expect(source).toContain("onOpenKnowledge: () => void")
})

test("uses the knowledge icon instead of the v2 fallback icon", async () => {
  const source = await Bun.file(new URL("./home-projects-view.tsx", import.meta.url)).text()

  expect(source).toContain('import { Icon } from "@opencode-ai/ui/icon"')
  expect(source).toContain('<Icon name="maxkb"')
  expect(source).not.toContain('<IconV2 name="maxkb"')
})
