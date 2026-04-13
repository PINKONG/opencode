import { describe, expect, test } from "bun:test"

const read = async (path: string) => Bun.file(new URL(path, import.meta.url)).text()

describe("app branding surface", () => {
  test("does not expose old brand in visible app metadata and links", async () => {
    const favicon = await read("../ui/../../ui/src/components/favicon.tsx")
    const manifest = await read("../ui/../../ui/src/assets/favicon/site.webmanifest")
    const error = await read("./pages/error.tsx")
    const sidebar = await read("./pages/layout/sidebar-items.tsx")
    const entry = await read("./entry.tsx")
    const schema = await read("../ui/../../ui/src/theme/desktop-theme.schema.json")
    const theme = await read("../ui/../../ui/src/theme/themes/opencode.json")
    const icon = await read("../ui/../../ui/src/components/icon.stories.tsx")
    const font = await read("../ui/../../ui/src/components/font.stories.tsx")
    const logo = await read("../ui/../../ui/src/components/logo.stories.tsx")
    const session = await read("./components/session/session-new-view.tsx")
    const app = await read("./app.tsx")
    const desktop = await read("../../desktop/src/loading.tsx")
    const electron = await read("../../desktop-electron/src/renderer/loading.tsx")

    expect(favicon).not.toContain('content="OpenCode"')
    expect(manifest).not.toContain('"OpenCode"')
    expect(error).not.toContain("https://opencode.ai/desktop-feedback")
    expect(sidebar).not.toContain("https://opencode.ai/favicon.svg")
    expect(entry).not.toContain("https://opencode.ai/favicon-96x96-v3.png")
    expect(schema).not.toContain("OpenCode Desktop Theme")
    expect(schema).not.toContain("A theme definition for the OpenCode desktop application")
    expect(theme).not.toContain('"name": "OpenCode"')
    expect(icon).not.toContain("OpenCode icon set")
    expect(font).not.toContain("OpenCode Sans Sample")
    expect(font).not.toContain("OpenCode Mono Sample")
    expect(logo).not.toContain("OpenCode logo assets")
    expect(session).toContain('<Logo class="w-28" />')
    expect(session).not.toContain('<Mark class="w-10" />')
    expect(app).toContain('<Logo class="w-32 opacity-50 animate-pulse" />')
    expect(app).toContain('<Logo class="w-24 mb-4" />')
    expect(app).not.toContain("<Splash")
    expect(desktop).toContain('<Logo class="w-32 opacity-15" />')
    expect(desktop).not.toContain("<Splash")
    expect(electron).toContain('<Logo class="w-32 opacity-15" />')
    expect(electron).not.toContain("<Splash")
  })

  test("uses wiscode config file names in visible app copy", async () => {
    const root = new URL(".", import.meta.url).pathname
    const locales = await Array.fromAsync(new Bun.Glob("i18n/*.ts").scan({ cwd: root, absolute: true }))
    const status = await read("./components/status-popover-body.tsx")
    const errors = await read("./utils/server-errors.ts")

    for (const file of locales) {
      expect(await Bun.file(file).text()).not.toContain("opencode.json")
    }
    expect(status).toContain('"wiscode.json"')
    expect(status).not.toContain('"opencode.json"')
    expect(errors).toContain("Check your config (wiscode.json) provider/model names")
    expect(errors).not.toContain("Check your config (opencode.json) provider/model names")
  })

  test("keeps upstream provider names for opencode services in app copy", async () => {
    const root = new URL(".", import.meta.url).pathname
    const locales = await Array.fromAsync(new Bun.Glob("i18n/*.ts").scan({ cwd: root, absolute: true }))

    for (const file of locales) {
      const text = await Bun.file(file).text()
      expect(text).not.toContain("WisCode Zen")
      expect(text).not.toContain("WisCode Go")
    }
  })

  test("keeps upstream provider names for opencode services across user-facing docs", async () => {
    const root = new URL("../../..", import.meta.url).pathname
    const files = [
      ...(await Array.fromAsync(new Bun.Glob("README*.md").scan({ cwd: root, absolute: true }))),
      ...(await Array.fromAsync(
        new Bun.Glob("packages/console/app/src/i18n/*.ts").scan({ cwd: root, absolute: true }),
      )),
      ...(await Array.fromAsync(
        new Bun.Glob("packages/web/src/content/docs/**/*.mdx").scan({ cwd: root, absolute: true }),
      )),
    ]

    for (const file of files) {
      const text = await Bun.file(file).text()
      expect(text).not.toContain("WisCode Zen")
      expect(text).not.toContain("WisCode Go")
    }
  })

  test("does not attribute OpenCode providers to the WisCode team", async () => {
    const root = new URL("../../..", import.meta.url).pathname
    const files = [
      ...(await Array.fromAsync(new Bun.Glob("README*.md").scan({ cwd: root, absolute: true }))),
      ...(await Array.fromAsync(
        new Bun.Glob("packages/web/src/content/docs/**/*.mdx").scan({ cwd: root, absolute: true }),
      )),
    ]
    const banned = [
      "provided by the WisCode team",
      "tested and verified by the WisCode team",
      "models we provide through [OpenCode Zen]",
      "النماذج التي نوفرها عبر [OpenCode Zen]",
      "τα μοντέλα που παρέχουμε μέσω του [OpenCode Zen]",
      "los modelos que ofrecemos a través de [OpenCode Zen]",
      "[OpenCode Zen](https://opencode.ai/zen) üzerinden sunduğumuz modelleri",
      "моделі, які надаємо через [OpenCode Zen]",
      "modele koje nudimo kroz [OpenCode Zen]",
      "os modelos que oferecemos pelo [OpenCode Zen]",
      "modellene vi tilbyr gjennom [OpenCode Zen]",
      "由 WisCode 提供的精选模型列表",
      "由 WisCode 提供的精選模型列表",
      "由 WisCode 团队提供",
      "由 WisCode 團隊提供",
      "WisCode チームが提供する",
      "WisCode チームによって提供される",
      "fournie par l'équipe WisCode",
      "fournis par l'équipe WisCode",
      "proporcionada por el equipo WisCode",
      "proporcionados por el equipo WisCode",
      "WisCode 팀이 제공하는",
      "командой WisCode",
      "WisCode ekibi tarafından",
      "ทีม WisCode",
      "equipe do WisCode",
      "WisCode tim",
      "zespół WisCode",
      "WisCode-teamet",
      "فريق WisCode",
    ]

    for (const file of files) {
      const text = await Bun.file(file).text()
      const lines = text.split("\n")
      const hits = lines.flatMap((line, index) => {
        if (!line.includes("OpenCode Zen") && !line.includes("OpenCode Go")) return []
        return [lines[index - 1] ?? "", line, lines[index + 1] ?? ""].join("\n")
      })

      for (const hit of hits) {
        for (const item of banned) {
          expect(hit).not.toContain(item)
        }
      }
    }
  })
})
