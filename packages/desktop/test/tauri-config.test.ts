import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../src-tauri/tauri.prod.conf.json")
const cfg = JSON.parse(await Bun.file(file).text()) as {
  plugins?: {
    updater?: {
      endpoints?: string[]
    }
  }
}

describe("tauri production config", () => {
  test("does not point updater at upstream opencode releases", () => {
    const list = cfg.plugins?.updater?.endpoints ?? []
    expect(list.length).toBeGreaterThan(0)
    for (const item of list) {
      expect(item).not.toContain("anomalyco/opencode")
      expect(item).toContain("latest.json")
    }
  })
})
