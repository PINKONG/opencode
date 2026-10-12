import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { prependBundledUvToPath } from "../../src/bmad/resources"

test("standalone CLI prepends sibling bundled uv to agent shell PATH", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wiscode-uv-path-"))
  try {
    await Bun.write(path.join(directory, process.platform === "win32" ? "uv.exe" : "uv"), "bundled")
    const env: NodeJS.ProcessEnv = { PATH: "/usr/local/bin" }
    expect(prependBundledUvToPath(env, path.join(directory, "wiscode-cli"))).toBe(true)
    expect(env.PATH?.split(path.delimiter)[0]).toBe(directory)
    expect(env.WISCODE_BUNDLED_UV_PATH).toBe(path.join(directory, process.platform === "win32" ? "uv.exe" : "uv"))
    expect(prependBundledUvToPath(env, path.join(directory, "wiscode-cli"))).toBe(true)
    expect(env.PATH?.split(path.delimiter)).toEqual([directory, "/usr/local/bin"])
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("explicit desktop uv path takes precedence without duplicating Path", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wiscode-uv-path-"))
  try {
    const uv = path.join(directory, process.platform === "win32" ? "uv.exe" : "uv")
    await Bun.write(uv, "bundled")
    const env: NodeJS.ProcessEnv = { Path: "/usr/local/bin", WISCODE_BUNDLED_UV_PATH: uv }
    expect(prependBundledUvToPath(env, path.join(directory, "elsewhere", "wiscode-cli"))).toBe(true)
    expect(env.Path?.split(path.delimiter)).toEqual([directory, "/usr/local/bin"])
    expect(env.PATH).toBeUndefined()
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})

test("missing bundled uv leaves PATH unchanged", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wiscode-uv-path-"))
  try {
    const env: NodeJS.ProcessEnv = { PATH: "/usr/local/bin" }
    expect(prependBundledUvToPath(env, path.join(directory, "wiscode-cli"))).toBe(false)
    expect(env).toEqual({ PATH: "/usr/local/bin" })
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
