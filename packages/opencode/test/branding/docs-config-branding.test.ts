import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../../..")
const docs = join(root, "packages/web/src/content/docs")

const scan = async (pat: string) => Array.fromAsync(new Bun.Glob(pat).scan({ cwd: docs }))
describe("docs config branding", () => {
  test("docs use wiscode config and storage paths", async () => {
    const bad = [
      "opencode.json",
      "opencode.jsonc",
      ".opencode/",
      "~/.config/opencode",
      "~/.local/share/opencode",
      "~/.cache/opencode",
      "%USERPROFILE%\\.config\\opencode",
      "%USERPROFILE%\\.local\\share\\opencode",
      "%USERPROFILE%\\.cache\\opencode",
      "opencode-cli",
    ]

    for (const file of await scan("**/*.mdx")) {
      const txt = await Bun.file(join(docs, file)).text()
      for (const item of bad) expect(txt).not.toContain(item)
    }
  })

  test("enterprise share page exposes WisCode public branding", async () => {
    const txt = await Bun.file(join(root, "packages/enterprise/src/routes/share/[shareID].tsx")).text()
    const entry = await Bun.file(join(root, "packages/enterprise/src/entry-server.tsx")).text()

    expect(entry).not.toContain("<title>OpenCode</title>")
    expect(entry).toContain("<title>WisCode</title>")

    expect(txt).toContain('<Title>{info().title} | WisCode</Title>')
    expect(txt).toContain('content="WisCode - The AI coding agent built for the terminal."')
    expect(txt).toContain('href="https://github.com/PINKONG/opencode"')
    expect(txt).not.toContain('content="opencode - The AI coding agent built for the terminal."')
    expect(txt).not.toContain('href="https://github.com/anomalyco/opencode"')
  })
})
