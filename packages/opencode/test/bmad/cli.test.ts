import { expect, test } from "bun:test"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"
import path from "node:path"

const source = path.resolve(import.meta.dirname, "../../../../third_party/bmad/skills")
const uv = Bun.which("uv") ?? ""

test.skipIf(!uv)("bmad init CLI returns interactive questions as JSON", async () => {
  const project = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-cli-"))
  const cache = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-cache-"))
  try {
    const child = Bun.spawn([process.execPath, "src/index.ts", "bmad", "init", "--project-root", project, "--interactive", "--confirm", "ignored"], {
      cwd: path.resolve(import.meta.dirname, "../.."),
      stdout: "pipe",
      stderr: "pipe",
      env: { ...process.env, WISCODE_BMAD_SKILLS_PATH: source, WISCODE_BUNDLED_UV_PATH: uv, WISCODE_BMAD_CACHE_PATH: cache },
    })
    const [stdout, stderr, code] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ])
    expect(code).toBe(0)
    expect(stderr).not.toContain("Unknown argument")
    expect(JSON.parse(stdout).status).toBe("questions")
    expect(await Bun.file(path.join(project, ".agents/skills/bmad/SKILL.md")).exists()).toBe(false)
  } finally {
    await rm(project, { recursive: true, force: true })
    await rm(cache, { recursive: true, force: true })
  }
}, 120_000)
