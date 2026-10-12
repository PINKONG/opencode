import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prepareBMADSource } from "../../src/bmad/source-cache"

test("BMAD source cache keeps a stable path across WisCode updates", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-cache-test-"))
  try {
    const vendor = path.join(root, "vendor")
    const cache = path.join(root, "cache")
    await mkdir(path.join(vendor, "skills", "bmad"), { recursive: true })
    await mkdir(path.join(vendor, "skills", "bmod-method"), { recursive: true })
    await Bun.write(path.join(vendor, "skills", "bmad", "SKILL.md"), "first")
    await Bun.write(path.join(vendor, "skills", "bmod-method", "bmod.toml"),
      '[bmod]\nupdate_source = "github:bmad-code-org/BMAD-METHOD/skills"\n')
    const first = await prepareBMADSource({ vendor, cache, commit: "first", wiscodeVersion: "1.0.0" })
    expect(await Bun.file(path.join(first, "bmad", "SKILL.md")).text()).toBe("first")
    expect(await Bun.file(path.join(first, "bmod-method", "bmod.toml")).text())
      .toContain(`update_source = "file:${first}"`)
    await Bun.write(path.join(vendor, "skills", "bmad", "SKILL.md"), "second")
    const second = await prepareBMADSource({ vendor, cache, commit: "second", wiscodeVersion: "1.1.0" })
    expect(second).toBe(first)
    expect(await Bun.file(path.join(second, "bmad", "SKILL.md")).text()).toBe("second")
    await expect(prepareBMADSource({ vendor, cache, commit: "first", wiscodeVersion: "1.0.0" })).rejects.toThrow(
      "newer WisCode",
    )
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
