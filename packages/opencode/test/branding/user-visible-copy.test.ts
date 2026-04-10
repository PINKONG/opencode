import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../src")

const branded = [
  "acp/agent.ts",
  "mcp/oauth-callback.ts",
  "plugin/codex.ts",
  "cli/cmd/mcp.ts",
  "cli/cmd/pr.ts",
  "cli/cmd/serve.ts",
  "cli/cmd/upgrade.ts",
  "cli/cmd/web.ts",
  "cli/cmd/tui/app.tsx",
  "cli/cmd/tui/component/dialog-status.tsx",
  "cli/cmd/uninstall.ts",
  "cli/cmd/tui/routes/session/permission.tsx",
  "cli/cmd/tui/routes/session/index.tsx",
  "cli/cmd/tui/component/dialog-provider.tsx",
  "cli/cmd/tui/feature-plugins/home/tips-view.tsx",
  "cli/cmd/tui/feature-plugins/sidebar/footer.tsx",
  "cli/error.ts",
  "provider/error.ts",
  "mcp/oauth-provider.ts",
]

describe("user visible branding copy", () => {
  for (const name of branded) {
    test(`${name} does not expose old OpenCode branding`, async () => {
      const txt = await Bun.file(join(root, name)).text()

      expect(txt).not.toContain("OpenCode")
      expect(txt).not.toContain("opencode.ai")
    })
  }

  test("cli-facing guidance uses wiscode command examples", async () => {
    const error = await Bun.file(join(root, "cli/error.ts")).text()
    const pr = await Bun.file(join(root, "cli/cmd/pr.ts")).text()
    const serve = await Bun.file(join(root, "cli/cmd/serve.ts")).text()
    const web = await Bun.file(join(root, "cli/cmd/web.ts")).text()
    const upgrade = await Bun.file(join(root, "cli/cmd/upgrade.ts")).text()
    const mcp = await Bun.file(join(root, "cli/cmd/mcp.ts")).text()
    const status = await Bun.file(join(root, "cli/cmd/tui/component/dialog-status.tsx")).text()
    const session = await Bun.file(join(root, "cli/cmd/tui/routes/session/index.tsx")).text()
    const acp = await Bun.file(join(root, "acp/agent.ts")).text()
    const provider = await Bun.file(join(root, "provider/error.ts")).text()
    const tips = await Bun.file(join(root, "cli/cmd/tui/feature-plugins/home/tips-view.tsx")).text()

    expect(error).toContain("wiscode models")
    expect(error).not.toContain("opencode models")

    expect(pr).toContain("then run wiscode")
    expect(pr).toContain('UI.println("Starting WisCode...")')
    expect(pr).toContain('Process.spawn(["wiscode", ...')
    expect(pr).not.toContain("then run opencode")
    expect(pr).not.toContain('UI.println("Starting opencode...")')
    expect(pr).not.toContain('Process.spawn(["opencode", ...')

    expect(serve).toContain("starts a headless wiscode server")
    expect(serve).toContain("wiscode server listening on")
    expect(serve).not.toContain("headless opencode server")
    expect(serve).not.toContain("opencode server listening on")

    expect(web).toContain("start wiscode server and open web interface")
    expect(web).not.toContain("start opencode server and open web interface")

    expect(upgrade).toContain("upgrade wiscode to the latest or a specific version")
    expect(upgrade).toContain("wiscode is installed to")
    expect(upgrade).toContain("wiscode upgrade skipped")
    expect(upgrade).not.toContain("upgrade opencode to the latest or a specific version")
    expect(upgrade).not.toContain("opencode is installed to")
    expect(upgrade).not.toContain("opencode upgrade skipped")

    expect(mcp).toContain("Add servers with: wiscode mcp add")
    expect(mcp).not.toContain("Add servers with: opencode mcp add")

    expect(status).toContain("Needs authentication (run: wiscode mcp auth {key})")
    expect(status).not.toContain("Needs authentication (run: opencode mcp auth {key})")

    expect(session).toContain("wiscode -s ${session()?.id}")
    expect(session).not.toContain("opencode -s ${session()?.id}")

    expect(acp).toContain("Run `wiscode auth login` in the terminal")
    expect(acp).toContain('name: "Login with WisCode"')
    expect(acp).toContain('command: "wiscode"')
    expect(acp).not.toContain("Run `opencode auth login` in the terminal")
    expect(acp).not.toContain('name: "Login with opencode"')
    expect(acp).not.toContain('command: "opencode"')

    expect(provider).toContain("wiscode auth login <your provider URL>")
    expect(provider).not.toContain("opencode auth login <your provider URL>")

    expect(tips).toContain("Use {highlight}wiscode run{/highlight} for non-interactive scripting")
    expect(tips).toContain("Use {highlight}wiscode --continue{/highlight} to resume the last session")
    expect(tips).toContain("Run {highlight}wiscode serve{/highlight} for headless API access to WisCode")
    expect(tips).toContain("Run {highlight}wiscode upgrade{/highlight} to update to the latest version")
    expect(tips).toContain("Run {highlight}wiscode auth list{/highlight} to see all configured providers")
    expect(tips).toContain("Run {highlight}wiscode agent create{/highlight} for guided agent creation")
    expect(tips).not.toContain("Use {highlight}opencode run{/highlight}")
    expect(tips).not.toContain("Use {highlight}opencode --continue{/highlight}")
    expect(tips).not.toContain("Run {highlight}opencode serve{/highlight}")
    expect(tips).not.toContain("Run {highlight}opencode upgrade{/highlight}")
    expect(tips).not.toContain("Run {highlight}opencode auth list{/highlight}")
    expect(tips).not.toContain("Run {highlight}opencode agent create{/highlight}")
    expect(tips).not.toContain("{highlight}/opencode{/highlight}")
    expect(tips).not.toContain("{highlight}/opencode fix this{/highlight}")
  })
})
