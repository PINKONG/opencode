import { expect, test } from "bun:test"
import { cp, mkdtemp, mkdir, rename, rm, symlink } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { initBMAD } from "../../src/bmad/init"

const source = path.resolve(import.meta.dirname, "../../../../third_party/bmad/skills")
const uv = Bun.which("uv") ?? ""

test.skipIf(!uv)("quick initialization installs Core Tools and Method into the project", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("ready")
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).exists()).toBe(true)
    expect(await Bun.file(path.join(project, ".agents/skills/bmod-method/bmod.toml")).exists()).toBe(true)
    expect(await Bun.file(path.join(project, ".agents/skills/bmod-toolsmith/bmod.toml")).exists()).toBe(false)
    expect(await Bun.file(path.join(project, "_bmad/config.toml")).exists()).toBe(true)
    expect(await Bun.file(path.join(project, "_bmad/scripts/resolve_config.py")).exists()).toBe(true)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("repeat initialization preserves project customization", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv })
    await Bun.write(path.join(project, "_bmad/custom/my-notes.md"), "keep me\n")
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("ready")
    expect(await Bun.file(path.join(project, "_bmad/custom/my-notes.md")).text()).toBe("keep me\n")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("edited managed skill is reported instead of overwritten", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv })
    const file = path.join(project, ".agents/skills/bmad/SKILL.md")
    await Bun.write(file, "user edit\n")
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("conflict")
    expect(await Bun.file(file).text()).toBe("user edit\n")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("unowned skill directory is never taken over", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    const dir = path.join(project, ".agents/skills/bmad")
    await mkdir(dir, { recursive: true })
    await Bun.write(path.join(dir, "SKILL.md"), "external\n")
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("conflict")
    expect(await Bun.file(path.join(dir, "SKILL.md")).text()).toBe("external\n")
    expect(await Bun.file(path.join(project, "_bmad/config.toml")).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test.skipIf(!uv)("interactive mode returns questions without project writes", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    const pending = await initBMAD({ project, source, uv, interactive: true })
    expect(pending.status).toBe("questions")
    expect(await Bun.file(path.join(project, "_bmad/config.toml")).exists()).toBe(false)
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).exists()).toBe(false)
    const result = await initBMAD({
      project,
      source,
      uv,
      interactive: true,
      answers: { outputFolder: "docs/bmad-output", toolsmith: true },
    })
    expect(result.status).toBe("ready")
    expect(await Bun.file(path.join(project, ".agents/skills/bmod-toolsmith/bmod.toml")).exists()).toBe(true)
    expect(await Bun.file(path.join(project, "_bmad/config.toml")).text()).toContain("docs/bmad-output")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test("missing uv is detected before project writes", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    const result = await initBMAD({ project, source, uv: path.join(project, "missing-uv") })
    expect(result.status).toBe("error")
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
})

test.skipIf(!uv)("nested symlink in a managed skill blocks reinitialization", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv })
    const scripts = path.join(project, ".agents/skills/bmad/scripts")
    const moved = path.join(project, "saved-scripts")
    await rename(scripts, moved)
    await symlink(moved, scripts, "dir")
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("conflict")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("optional module cannot take over an external skill directory", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv })
    const dir = path.join(project, ".agents/skills/bmod-toolsmith")
    await mkdir(dir, { recursive: true })
    await Bun.write(path.join(dir, "external.txt"), "external")
    const result = await initBMAD({ project, source, uv, interactive: true, answers: { toolsmith: true } })
    expect(result.status).toBe("conflict")
    expect(await Bun.file(path.join(dir, "external.txt")).text()).toBe("external")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("malformed management manifest is rejected before writing skills", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await mkdir(path.join(project, ".opencode"), { recursive: true })
    await Bun.write(path.join(project, ".opencode/bmad-managed.json"), JSON.stringify({
      schema: 1,
      commit: "old",
      modules: ["bmod-method"],
      phase: "ready",
      files: { "../outside.txt": "0".repeat(64) },
    }))
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("conflict")
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("custom migration requires an explicit matching confirmation", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv })
    const old = path.join(project, "_bmad/custom/bmad-create-ux-design.toml")
    const moved = path.join(project, "_bmad/custom/bmad-ux.toml")
    await Bun.write(old, "custom = true\n")
    const pending = await initBMAD({ project, source, uv })
    expect(pending.status).toBe("needs-confirmation")
    if (pending.status !== "needs-confirmation") return
    expect(pending.confirmation).toBeTruthy()
    expect(await Bun.file(old).exists()).toBe(true)
    const result = await initBMAD({ project, source, uv, confirm: pending.confirmation })
    expect(result.status).toBe("ready")
    expect(await Bun.file(old).exists()).toBe(false)
    expect(await Bun.file(moved).text()).toBe("custom = true\n")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("retiring an optional module deletes only confirmed managed files", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv, interactive: true, answers: { toolsmith: true } })
    const record = path.join(project, ".agents/skills/bmod-toolsmith/bmod.toml")
    const pending = await initBMAD({ project, source, uv })
    expect(pending.status).toBe("needs-confirmation")
    if (pending.status !== "needs-confirmation") return
    expect(await Bun.file(record).exists()).toBe(true)
    const result = await initBMAD({ project, source, uv, confirm: pending.confirmation })
    expect(result.status).toBe("ready")
    expect(await Bun.file(record).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("external retired skill requires manual review without a confirmation token", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    await initBMAD({ project, source, uv })
    const dir = path.join(project, ".agents/skills/bmad-create-ux-design")
    await mkdir(dir)
    await Bun.write(path.join(dir, "SKILL.md"), "external\n")
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("needs-confirmation")
    if (result.status !== "needs-confirmation") return
    expect(result.confirmation).toBeUndefined()
    expect(await Bun.file(path.join(dir, "SKILL.md")).text()).toBe("external\n")
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("linked management directory is rejected before writing", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  const external = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-external-"))
  try {
    await symlink(external, path.join(project, ".opencode"), "dir")
    const result = await initBMAD({ project, source, uv })
    expect(result.status).toBe("conflict")
    expect(await Bun.file(path.join(external, "bmad-managed.json")).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
    await rm(external, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("a new source commit updates managed files even when module versions match", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  const updated = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-update-"))
  try {
    await initBMAD({ project, source, uv, sourceCommit: "first" })
    await Bun.write(path.join(project, "_bmad/custom/my-notes.md"), "keep\n")
    await cp(source, updated, { recursive: true })
    const changed = path.join(updated, "bmad/SKILL.md")
    await Bun.write(changed, `${await Bun.file(changed).text()}\nUpdated snapshot.\n`)
    const result = await initBMAD({ project, source: updated, uv, sourceCommit: "second" })
    expect(result.status).toBe("ready")
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).text()).toContain("Updated snapshot.")
    expect(await Bun.file(path.join(project, ".opencode/bmad-managed.json")).json()).toMatchObject({ commit: "second" })
    expect(await Bun.file(path.join(project, "_bmad/custom/my-notes.md")).text()).toBe("keep\n")
  } finally {
    await rm(project, { recursive: true, force: true })
    await rm(updated, { recursive: true, force: true })
  }
}, 120_000)

test.skipIf(!uv)("interactive output folder rejects Windows absolute paths before writing", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-"))
  try {
    const result = await initBMAD({ project, source, uv, interactive: true,
      answers: { outputFolder: "C:\\outside", toolsmith: false } })
    expect(result.status).toBe("error")
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
  }
}, 120_000)
