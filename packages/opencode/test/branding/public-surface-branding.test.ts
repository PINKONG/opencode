import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../../..")
const keys = [
  "app.lander.images.tui.caption",
  "app.lander.images.tui.alt",
  "app.lander.images.vscode.caption",
  "app.lander.images.vscode.alt",
  "app.lander.images.github.caption",
  "app.lander.images.github.alt",
  "share.meta_description",
  "share.opencode_version",
  "share.opencode_name",
]
const langs = [
  "ar.json",
  "bs.json",
  "da.json",
  "de.json",
  "en.json",
  "es.json",
  "fr.json",
  "it.json",
  "ja.json",
  "ko.json",
  "nb.json",
  "pl.json",
  "pt-BR.json",
  "ru.json",
  "th.json",
  "tr.json",
  "zh-CN.json",
  "zh-TW.json",
]

describe("public surface branding", () => {
  test("web landing and share pages use WisCode branding", async () => {
    const astro = await Bun.file(join(root, "packages/web/astro.config.mjs")).text()
    const lander = await Bun.file(join(root, "packages/web/src/components/Lander.astro")).text()
    const share = await Bun.file(join(root, "packages/web/src/pages/s/[id].astro")).text()

    expect(astro).toContain('title: "WisCode"')
    expect(astro).not.toContain('title: "OpenCode"')

    expect(lander).toContain("web.install")
    expect(lander).toContain("wiscode-ai")
    expect(lander).toContain("brew install wiscode")
    expect(lander).toContain("paru -S wiscode-bin")
    expect(lander).toContain("github:PINKONG/opencode")
    expect(lander).not.toContain("opencode.ai/install")
    expect(lander).not.toContain("opencode-ai")
    expect(lander).not.toContain("brew install opencode")
    expect(lander).not.toContain("paru -S opencode-bin")
    expect(lander).not.toContain("github:anomalyco/opencode")

    expect(share).toContain("/wiscode-share/")
    expect(share).not.toContain("/opencode-share/")
  })

  test("zed extension metadata points to WisCode releases", async () => {
    const ext = await Bun.file(join(root, "packages/extensions/zed/extension.toml")).text()
    const version = ext.match(/^version = "([^"]+)"/m)?.[1]

    expect(ext).toContain('id = "wiscode"')
    expect(ext).toContain('name = "WisCode"')
    expect(version).toBeDefined()
    const release = `https://github.com/PINKONG/opencode/releases/download/v${version}`
    expect(ext).toContain('repository = "https://github.com/PINKONG/opencode"')
    expect(ext).toContain("[agent_servers.wiscode]")
    expect(ext).toContain(`archive = "${release}/wiscode-cli-darwin-arm64.zip"`)
    expect(ext).toContain(`archive = "${release}/wiscode-cli-darwin-x64.zip"`)
    expect(ext).toContain(`archive = "${release}/wiscode-cli-linux-arm64.tar.gz"`)
    expect(ext).toContain(`archive = "${release}/wiscode-cli-linux-x64.tar.gz"`)
    expect(ext).toContain(`archive = "${release}/wiscode-cli-windows-x64.zip"`)
    expect(ext).toContain('cmd = "./wiscode-cli"')
    expect(ext).toContain('cmd = "./wiscode-cli.exe"')
    expect(ext).not.toContain("anomalyco/opencode")
    expect(ext).not.toContain('cmd = "./opencode"')
    expect(ext).not.toContain('cmd = "./opencode.exe"')
  })

  test("vscode extension metadata and docs use WisCode branding", async () => {
    const pkg = await Bun.file(join(root, "sdks/vscode/package.json")).text()
    const readme = await Bun.file(join(root, "sdks/vscode/README.md")).text()

    expect(pkg).toContain('"displayName": "WisCode"')
    expect(pkg).toContain('"description": "WisCode for VS Code"')
    expect(pkg).not.toContain('"displayName": "opencode"')
    expect(pkg).not.toContain('"description": "opencode for VS Code"')
    expect(pkg).not.toContain('"title": "Open opencode"')
    expect(pkg).not.toContain('"title": "Open opencode in new tab"')
    expect(pkg).not.toContain('"title": "Run opencode"')
    expect(pkg).not.toContain('"title": "opencode: Insert At-Mentioned"')
    expect(readme).not.toContain("https://opencode.ai")
    expect(readme).not.toContain("Visit [opencode.ai]")
  })

  test("install script pulls WisCode CLI releases instead of upstream OpenCode", async () => {
    const script = await Bun.file(join(root, "install")).text()

    expect(script).toContain("https://github.com/PINKONG/opencode/releases/latest")
    expect(script).toContain("https://github.com/PINKONG/opencode/releases/download/")
    expect(script).not.toContain("https://github.com/anomalyco/opencode/releases")
    expect(script).not.toContain("https://opencode.ai/install")
  })

  test("web locale values no longer expose old OpenCode branding", async () => {
    for (const lang of langs) {
      const txt = await Bun.file(join(root, "packages/web/src/content/i18n", lang)).text()
      const json = JSON.parse(txt)

      for (const key of keys) {
        const val = json[key]
        expect(typeof val).toBe("string")
        expect(val).not.toMatch(/OpenCode|opencode/)
      }
    }
  })
})
