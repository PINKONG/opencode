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
  })
})
