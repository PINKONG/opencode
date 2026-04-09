import { describe, expect, test } from "bun:test"
import { readdirSync } from "node:fs"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

describe("desktop i18n branding", () => {
  test("does not reference OpenCode in locale strings", async () => {
    const dir = dirname(fileURLToPath(import.meta.url))
    const bad = []

    for (const path of readdirSync(dir)) {
      if (path === "index.ts" || path === "branding.test.js") continue
      if (!path.endsWith(".ts")) continue
      const text = await Bun.file(join(dir, path)).text()
      if (text.includes("OpenCode")) bad.push(path)
    }

    expect(bad).toEqual([])
  })
})
