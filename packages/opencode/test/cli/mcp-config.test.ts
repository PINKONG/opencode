import { describe, expect, test } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { parse as parseJsonc } from "jsonc-parser"
import * as mcp from "../../src/cli/cmd/mcp"
import { tmpdir } from "../fixture/fixture"

describe("mcp config isolation", () => {
  test("resolves legacy local config to a wiscode write target", async () => {
    await using tmp = await tmpdir()
    const dir = path.join(tmp.path, ".opencode")
    const file = path.join(dir, "opencode.json")
    await fs.mkdir(dir, { recursive: true })
    await Bun.write(file, "{}")

    const fn = (mcp as any).resolveMcpConfig
    const out = await fn(tmp.path, false)

    expect(out).toEqual({
      read: file,
      write: path.join(tmp.path, ".wiscode", "wiscode.json"),
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
})
