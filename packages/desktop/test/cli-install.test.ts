import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const pkg = await Bun.file(join(dir, "../package.json")).json()

describe("desktop packaging hooks", () => {
  test("package script runs prebuild hook for sidecar preparation", () => {
    expect(pkg.scripts.prebuild).toBe("bun ./scripts/prebuild.ts")
    expect(pkg.scripts.package).toBe("electron-builder --config electron-builder.config.ts")
  })
})
