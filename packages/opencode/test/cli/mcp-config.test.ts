import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { parse as parseJsonc } from "jsonc-parser"
import * as mcp from "../../src/cli/cmd/mcp"
import { tmpdir } from "../fixture/fixture"

describe("mcp config isolation", () => {
  test("prefers local wiscode config over project root config", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "wiscode.json")
    const localDir = path.join(tmp.path, ".wiscode")
    const local = path.join(localDir, "wiscode.json")
    await fs.mkdir(localDir, { recursive: true })
    await Bun.write(root, "{}")
    await Bun.write(local, "{}")

    const fn = (mcp as any).resolveMcpConfig
    const out = await fn(tmp.path, false)

    expect(out).toEqual({
      read: local,
      write: local,
    })
  })

  test("prefers jsonc over json in the same local config directory", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".wiscode")
    const json = path.join(dir, "wiscode.json")
    const jsonc = path.join(dir, "wiscode.jsonc")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(json, "{}")
    await Bun.write(jsonc, "{}")

    const fn = (mcp as any).resolveMcpConfig
    const out = await fn(tmp.path, false)

    expect(out).toEqual({
      read: jsonc,
      write: jsonc,
    })
  })

  test("resolves legacy local config to a wiscode write target", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".opencode")
    const file = path.join(dir, "opencode.json")
    const next = path.join(tmp.path, ".wiscode", "wiscode.jsonc")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(file, "{}")

    const fn = (mcp as any).resolveMcpConfig
    const out = await fn(tmp.path, false)

    expect(out).toEqual({
      read: file,
      write: next,
    })
  })

  test("prefers legacy jsonc over json in the same opencode directory", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".opencode")
    const json = path.join(dir, "opencode.json")
    const jsonc = path.join(dir, "opencode.jsonc")
    const next = path.join(tmp.path, ".wiscode", "wiscode.jsonc")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(json, "{}")
    await Bun.write(jsonc, "{}")

    const fn = (mcp as any).resolveMcpConfig
    const out = await fn(tmp.path, false)

    expect(out).toEqual({
      read: jsonc,
      write: next,
    })
  })

  test("reads legacy local config but writes the update into wiscode config", async () => {
    await using tmp = await tmpdir()
    const oldDir = path.join(tmp.path, ".opencode")
    const oldFile = path.join(oldDir, "opencode.json")
    const newFile = path.join(tmp.path, ".wiscode", "wiscode.json")
    await fs.mkdir(oldDir, { recursive: true })
    await Bun.write(
      oldFile,
      JSON.stringify(
        {
          "$schema": "https://opencode.ai/config.json",
          model: "seed",
        },
        null,
        2,
      ),
    )

    const fn = (mcp as any).patchMcpConfig
    const out = await fn(
      "demo",
      { type: "local", command: ["echo", "hi"] },
      {
        read: oldFile,
        write: newFile,
      },
    )

    expect(out).toBe(newFile)
    expect(await Bun.file(oldFile).text()).toContain('"model": "seed"')
    expect(await Bun.file(newFile).exists()).toBe(true)
    expect(parseJsonc(await Bun.file(newFile).text())).toEqual({
      $schema: "https://opencode.ai/config.json",
      model: "seed",
      mcp: {
        demo: {
          type: "local",
          command: ["echo", "hi"],
        },
      },
    })
  })

  test("reads local jsonc before json when both exist", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".wiscode")
    const json = path.join(dir, "wiscode.json")
    const jsonc = path.join(dir, "wiscode.jsonc")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(
      json,
      JSON.stringify(
        {
          mcp: {
            docs: { type: "local", command: ["echo", "json"] },
          },
        },
        null,
        2,
      ),
    )
    await Bun.write(
      jsonc,
      JSON.stringify(
        {
          mcp: {
            docs: { type: "local", command: ["echo", "jsonc"] },
          },
        },
        null,
        2,
      ),
    )

    const fn = (mcp as any).patchMcpConfig
    const out = await fn(
      "docs",
      { type: "local", command: ["echo", "next"] },
      {
        read: jsonc,
        write: jsonc,
      },
    )

    expect(out).toBe(jsonc)
    expect(parseJsonc(await Bun.file(json).text())).toEqual({
      mcp: {
        docs: { type: "local", command: ["echo", "json"] },
      },
    })
    expect(parseJsonc(await Bun.file(jsonc).text())).toEqual({
      mcp: {
        docs: { type: "local", command: ["echo", "next"] },
      },
    })
  })
})
