import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../../..")
const docs = join(root, "packages/web/src/content/docs")

const scan = async (pat: string) => Array.fromAsync(new Bun.Glob(pat).scan({ cwd: docs }))

describe("docs entry branding", () => {
  test("install entry docs no longer point distribution commands at upstream", async () => {
    const pats = [
      "index.mdx",
      "*/index.mdx",
      "windows-wsl.mdx",
      "*/windows-wsl.mdx",
    ]
    const bad = [
      "brew install anomalyco/tap/opencode",
      "mise use -g github:anomalyco/opencode",
      "docker run -it --rm ghcr.io/anomalyco/opencode",
      "https://github.com/anomalyco/opencode/releases",
    ]

    for (const pat of pats) {
      for (const file of await scan(pat)) {
        const txt = await Bun.file(join(docs, file)).text()
        for (const item of bad) expect(txt).not.toContain(item)
      }
    }
  })

  test("github action docs use the fork repository", async () => {
    for (const file of await scan("**/github.mdx")) {
      const txt = await Bun.file(join(docs, file)).text()
      expect(txt).not.toContain("uses: anomalyco/opencode/github@latest")
      expect(txt).toContain("uses: PINKONG/opencode/github@latest")
    }
  })

  test("agents and troubleshooting docs link to WisCode repo paths", async () => {
    for (const file of await scan("**/agents.mdx")) {
      const txt = await Bun.file(join(docs, file)).text()
      expect(txt).not.toContain("https://github.com/anomalyco/opencode")
    }
    expect(await Bun.file(join(docs, "agents.mdx")).text()).toContain("https://github.com/PINKONG/opencode")

    for (const file of await scan("**/troubleshooting.mdx")) {
      const txt = await Bun.file(join(docs, file)).text()
      expect(txt).not.toContain("https://github.com/anomalyco/opencode/issues")
    }
    expect(await Bun.file(join(docs, "troubleshooting.mdx")).text()).toContain("https://github.com/PINKONG/opencode/issues")
  })
})
