import { expect, test } from "bun:test"

test("VS Code extension launches WisCode CLI", async () => {
  const source = await Bun.file(new URL("./extension.ts", import.meta.url)).text()
  const manifest = await Bun.file(new URL("../package.json", import.meta.url)).text()
  const publish = await Bun.file(new URL("../script/publish", import.meta.url)).text()

  expect(source).toContain('const TERMINAL_NAME = "wiscode"')
  expect(source).toContain("wiscode --port")
  expect(source).not.toContain("opencode --port")
  expect(manifest).toContain('"url": "https://github.com/PINKONG/opencode"')
  expect(manifest).toContain('"title": "Open WisCode"')
  expect(manifest).not.toContain("Open opencode")
  expect(publish).toContain("dist/wiscode.vsix")
  expect(publish).not.toContain("dist/opencode.vsix")
})
