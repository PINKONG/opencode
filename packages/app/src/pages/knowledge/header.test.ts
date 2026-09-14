import { expect, test } from "bun:test"

test("uses translated knowledge navigation labels", async () => {
  const source = await Bun.file(new URL("../../i18n/zh.ts", import.meta.url)).text()

  expect(source).toContain('"sidebar.knowledge": "知识库"')
  expect(source).toContain('"knowledge.page.root": "知识库"')
  expect(source).toContain('"knowledge.nav.exit": "退出知识库"')
})
