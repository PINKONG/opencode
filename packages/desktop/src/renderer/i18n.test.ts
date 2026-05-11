import { describe, expect, test } from "bun:test"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))

const files = [
  "ar.ts",
  "br.ts",
  "bs.ts",
  "da.ts",
  "de.ts",
  "en.ts",
  "es.ts",
  "fr.ts",
  "ja.ts",
  "ko.ts",
  "no.ts",
  "pl.ts",
  "ru.ts",
  "zh.ts",
  "zht.ts",
]

describe("electron renderer branding", () => {
  for (const name of files) {
    test(`${name} uses WisCode branding in updater and CLI copy`, async () => {
      const src = await Bun.file(join(dir, "i18n", name)).text()

      expect(src).not.toContain("OpenCode")
      expect(src).not.toContain("'opencode'")
    })
  }
})
