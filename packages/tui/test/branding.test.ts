import { expect, test } from "bun:test"
import { join } from "node:path"

test("desktop notification title uses WisCode branding", async () => {
  const source = await Bun.file(join(import.meta.dir, "../src/attention.ts")).text()
  expect(source).toContain('const DEFAULT_TITLE = "WisCode"')
  expect(source).not.toContain('const DEFAULT_TITLE = "opencode"')
})
