import { expect, test } from "bun:test"

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
