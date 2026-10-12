import { expect, test } from "bun:test"
import path from "node:path"

test("vendor refresh reproduces the pinned BMAD snapshot", async () => {
  const root = path.resolve(import.meta.dirname, "../../../..")
  const source = path.resolve(root, "../..", "ai/BMAD-METHOD")
  const commit = (await Bun.file(path.join(root, "third_party/bmad/SOURCE.json")).json()).commit
  const child = Bun.spawn([process.execPath, "script/update-bmad.ts", "--source", source, "--commit", commit, "--check"], {
    cwd: root,
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  expect(code).toBe(0)
  expect(stderr).toBe("")
  expect(stdout).toContain("BMAD snapshot matches")
}, 120_000)
