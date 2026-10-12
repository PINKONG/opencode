import { expect, test } from "bun:test"
import path from "node:path"

const vendor = path.resolve(import.meta.dirname, "../../../../third_party/bmad")

test("BMAD vendor snapshot is pinned and includes its license and setup runtime", async () => {
  const source = await Bun.file(path.join(vendor, "SOURCE.json")).json()
  expect(source.commit).toBe("9f1987169a2e5626e5ccb31bb9cee051fdb3df20")
  expect(source.version).toBe("6.13.0-next")
  expect(await Bun.file(path.join(vendor, "LICENSE")).exists()).toBe(true)
  expect(await Bun.file(path.join(vendor, "skills/bmad/scripts/setup.py")).exists()).toBe(true)
  expect(await Bun.file(path.join(vendor, "skills/bmod-method/bmod.toml")).exists()).toBe(true)
})

test.skipIf(!Bun.which("uv"))("local BMAD updates point to WisCode's initializer", async () => {
  const setup = path.join(vendor, "skills/bmad/scripts/setup.py")
  const script = [
    "import runpy,sys",
    "module = runpy.run_path(sys.argv[1], run_name='bmad_test')",
    "print(module['next_step']((), [], local_update_available=True))",
  ].join("; ")
  const child = Bun.spawn([Bun.which("uv")!, "run", "--no-cache", "--python", "3.11", "python", "-c", script, setup], {
    stdout: "pipe",
    stderr: "pipe",
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  expect(stderr).toBe("")
  expect(code).toBe(0)
  expect(stdout.trim()).toBe("wiscode bmad init")
}, 120_000)
