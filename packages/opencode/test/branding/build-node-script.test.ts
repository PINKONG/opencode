import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../../..")

describe("build-node script", () => {
  test("embeds web ui into node sidecar bundle", async () => {
    const script = await Bun.file(join(root, "packages/opencode/script/build-node.ts")).text()

    expect(script).toContain("Building Web UI to embed in the node bundle")
    expect(script).toContain('await $`OPENCODE_CHANNEL=${Script.channel} bun run --cwd ${appDir} build`')
    expect(script).toContain('"opencode-web-ui.gen.ts": embeddedFileMap')
    expect(script).not.toContain('"opencode-web-ui.gen.ts": ""')
  })
})
