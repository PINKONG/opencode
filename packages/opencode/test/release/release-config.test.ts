import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../../..")

describe("release config", () => {
  test("nix opencode package keeps a wiscode-cli binary for desktop sidecars", async () => {
    const desktop = await Bun.file(join(root, "nix/desktop.nix")).text()
    const opencode = await Bun.file(join(root, "nix/opencode.nix")).text()

    expect(desktop).toContain('${opencode}/bin/wiscode-cli')
    expect(opencode).toContain("$out/bin/wiscode-cli")
  })

  test("homebrew formula installs wiscode-cli as wiscode", async () => {
    const publish = await Bun.file(join(root, "packages/opencode/script/publish.ts")).text()

    expect(publish).toContain('bin.install "${cli}" => "${cmd}"')
  })
})
