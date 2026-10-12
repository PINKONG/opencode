import { expect, test } from "bun:test"
import { mkdtemp, mkdir, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { hasCliResources, installCliResources } from "./cli-resources"

test("desktop CLI install includes bundled uv and BMAD and replaces stale skills", async () => {
  const root = await mkdtemp(path.join(os.tmpdir(), "wiscode-cli-resources-"))
  try {
    const source = path.join(root, "source")
    const target = path.join(root, "target")
    await mkdir(path.join(source, "bmad", "skills", "bmad"), { recursive: true })
    await mkdir(path.join(target, "bmad", "skills", "retired"), { recursive: true })
    await Bun.write(path.join(source, process.platform === "win32" ? "uv.exe" : "uv"), "bundled uv")
    await Bun.write(path.join(source, "uv-LICENSE-MIT"), "license")
    await Bun.write(path.join(source, "bmad", "SOURCE.json"), "{}")
    await Bun.write(path.join(source, "bmad", "skills", "bmad", "SKILL.md"), "bundled skill")
    await Bun.write(path.join(target, "bmad", "skills", "retired", "SKILL.md"), "stale")

    expect(hasCliResources(target)).toBe(false)
    installCliResources(source, target)
    expect(hasCliResources(target)).toBe(true)
    expect(await Bun.file(path.join(target, process.platform === "win32" ? "uv.exe" : "uv")).text()).toBe("bundled uv")
    expect(await Bun.file(path.join(target, "uv-LICENSE-MIT")).text()).toBe("license")
    expect(await Bun.file(path.join(target, "bmad", "skills", "bmad", "SKILL.md")).text()).toBe("bundled skill")
    expect(await Bun.file(path.join(target, "bmad", "skills", "retired", "SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(root, { recursive: true, force: true })
  }
})
