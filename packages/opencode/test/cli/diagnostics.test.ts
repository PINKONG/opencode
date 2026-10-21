import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"

test("diagnostics status prints an absolute local log directory", async () => {
  const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "status"], {
    cwd: new URL("../../", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  const output = await new Response(child.stdout).text()
  expect(await child.exited).toBe(0)
  const status = JSON.parse(output.trim()) as { root: string; enabled: boolean }
  expect(status.root).toMatch(/^\//)
  expect(typeof status.enabled).toBe("boolean")
}, 30_000)

test("diagnostics cleanup requires an explicit yes flag", async () => {
  const child = Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "cleanup"], {
    cwd: new URL("../../", import.meta.url).pathname,
    stdout: "pipe",
    stderr: "pipe",
  })
  expect(await child.exited).not.toBe(0)
}, 30_000)

test("diagnostics clear requires --yes and removes today's files", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-diagnostics-clear-"))
  try {
    const file = path.join(root, "data", "wiscode", "log", "diagnostics", new Date().toISOString().slice(0, 10), "ses_cli.jsonl")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, "current\n")
    const env = {
      ...process.env,
      XDG_DATA_HOME: path.join(root, "data"),
      XDG_CACHE_HOME: path.join(root, "cache"),
      XDG_CONFIG_HOME: path.join(root, "config"),
      XDG_STATE_HOME: path.join(root, "state"),
    }
    const run = (args: string[]) =>
      Bun.spawn([process.execPath, "src/index.ts", "diagnostics", "clear", ...args], {
        cwd: new URL("../../", import.meta.url).pathname,
        env,
        stdout: "pipe",
        stderr: "pipe",
      })
    const refused = run([])
    expect(await refused.exited).not.toBe(0)
    expect(await new Response(refused.stderr).text()).toContain("requires --yes")
    expect(await fs.readFile(file, "utf8")).toBe("current\n")

    const cleared = run(["--yes"])
    expect(await cleared.exited).toBe(0)
    expect(JSON.parse(await new Response(cleared.stdout).text())).toMatchObject({ deleted: 1, skipped: 0 })
    await expect(fs.stat(file)).rejects.toThrow()
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
}, 30_000)
