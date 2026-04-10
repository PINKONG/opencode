import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { parse as parseJsonc } from "jsonc-parser"
import { patchPluginConfig } from "../../src/plugin/install"
import { tmpdir } from "../fixture/fixture"

describe("plugin config isolation", () => {
  test("reads legacy .opencode config but writes server plugins into .wiscode", async () => {
    await using tmp = await tmpdir()
    const oldDir = path.join(tmp.path, ".opencode")
    const oldFile = path.join(oldDir, "opencode.jsonc")
    const newFile = path.join(tmp.path, ".wiscode", "wiscode.jsonc")
    await fs.mkdir(oldDir, { recursive: true })
    await Bun.write(
      oldFile,
      `{
  "plugin": [
    "seed@1.0.0"
  ]
}
`,
    )

    const out = await patchPluginConfig({
      spec: "acme@1.2.3",
      targets: [{ kind: "server" }],
      worktree: tmp.path,
      directory: tmp.path,
      vcs: "git",
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.items).toEqual([{ kind: "server", mode: "add", file: newFile }])
    expect(await Bun.file(oldFile).text()).toContain('"seed@1.0.0"')
    expect(parseJsonc(await Bun.file(newFile).text())).toEqual({
      plugin: ["seed@1.0.0", "acme@1.2.3"],
    })
  })

  test("reports the legacy file path when legacy config JSON is invalid", async () => {
    await using tmp = await tmpdir()
    const oldDir = path.join(tmp.path, ".opencode")
    const oldFile = path.join(oldDir, "opencode.jsonc")
    await fs.mkdir(oldDir, { recursive: true })
    await Bun.write(oldFile, '{"plugin":["seed@1.0.0",}')

    const out = await patchPluginConfig({
      spec: "acme@1.2.3",
      targets: [{ kind: "server" }],
      worktree: tmp.path,
      directory: tmp.path,
      vcs: "git",
    })

    expect(out.ok).toBe(false)
    if (out.ok) return
    expect(out.code).toBe("invalid_json")
    if (out.code !== "invalid_json") return
    expect(out.file).toBe(oldFile)
  })

  test("keeps noop reports pointed at the legacy file when nothing is written", async () => {
    await using tmp = await tmpdir()
    const oldDir = path.join(tmp.path, ".opencode")
    const oldFile = path.join(oldDir, "opencode.jsonc")
    const newFile = path.join(tmp.path, ".wiscode", "wiscode.jsonc")
    await fs.mkdir(oldDir, { recursive: true })
    await Bun.write(
      oldFile,
      JSON.stringify(
        {
          plugin: ["acme@1.2.3"],
        },
        null,
        2,
      ),
    )

    const out = await patchPluginConfig({
      spec: "acme@1.2.3",
      targets: [{ kind: "server" }],
      worktree: tmp.path,
      directory: tmp.path,
      vcs: "git",
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.items).toEqual([{ kind: "server", mode: "noop", file: oldFile }])
    expect(await Bun.file(newFile).exists()).toBe(false)
  })

  test("does not keep writing .wiscode/opencode.jsonc when only the legacy name exists there", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".wiscode")
    const oldFile = path.join(dir, "opencode.jsonc")
    const newFile = path.join(dir, "wiscode.jsonc")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(
      oldFile,
      JSON.stringify(
        {
          plugin: ["seed@1.0.0"],
        },
        null,
        2,
      ),
    )

    const out = await patchPluginConfig({
      spec: "acme@1.2.3",
      targets: [{ kind: "server" }],
      worktree: tmp.path,
      directory: tmp.path,
      vcs: "git",
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.items).toEqual([{ kind: "server", mode: "add", file: newFile }])
    expect(parseJsonc(await Bun.file(newFile).text())).toEqual({
      plugin: ["seed@1.0.0", "acme@1.2.3"],
    })
    expect(parseJsonc(await Bun.file(oldFile).text())).toEqual({
      plugin: ["seed@1.0.0"],
    })
  })

  test("prefers jsonc over json in the same wiscode directory", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".wiscode")
    const json = path.join(dir, "wiscode.json")
    const jsonc = path.join(dir, "wiscode.jsonc")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(
      json,
      JSON.stringify(
        {
          plugin: ["json@1.0.0"],
        },
        null,
        2,
      ),
    )
    await Bun.write(
      jsonc,
      JSON.stringify(
        {
          plugin: ["jsonc@1.0.0"],
        },
        null,
        2,
      ),
    )

    const out = await patchPluginConfig({
      spec: "acme@1.2.3",
      targets: [{ kind: "server" }],
      worktree: tmp.path,
      directory: tmp.path,
      vcs: "git",
    })

    expect(out.ok).toBe(true)
    if (!out.ok) return
    expect(out.items).toEqual([{ kind: "server", mode: "add", file: jsonc }])
    expect(parseJsonc(await Bun.file(json).text())).toEqual({
      plugin: ["json@1.0.0"],
    })
    expect(parseJsonc(await Bun.file(jsonc).text())).toEqual({
      plugin: ["jsonc@1.0.0", "acme@1.2.3"],
    })
  })
})
