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
  "cli/cmd/providers.ts",
  "cli/cmd/run.ts",
  "cli/cmd/serve.ts",
  "cli/cmd/tui/attach.ts",
  "cli/cmd/tui/component/error-component.tsx",
  "cli/cmd/upgrade.ts",
  "cli/cmd/web.ts",
  "cli/cmd/tui/app.tsx",
  "cli/cmd/tui/component/dialog-status.tsx",
  "cli/cmd/uninstall.ts",
  "cli/network.ts",
  "cli/cmd/tui/thread.ts",
  "server/mdns.ts",
  "cli/cmd/tui/routes/session/permission.tsx",
  "cli/cmd/tui/routes/session/index.tsx",
  "cli/cmd/tui/component/dialog-provider.tsx",
  "cli/cmd/tui/feature-plugins/home/tips-view.tsx",
  "cli/cmd/tui/feature-plugins/sidebar/footer.tsx",
  "cli/error.ts",
  "provider/error.ts",
  "mcp/oauth-provider.ts",
  "session/retry.ts",
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
    const github = await Bun.file(join(root, "cli/cmd/github.ts")).text()
    const index = await Bun.file(join(root, "index.ts")).text()
    const providers = await Bun.file(join(root, "cli/cmd/providers.ts")).text()
    const retry = await Bun.file(join(root, "session/retry.ts")).text()
    const run = await Bun.file(join(root, "cli/cmd/run.ts")).text()
    const serve = await Bun.file(join(root, "cli/cmd/serve.ts")).text()
    const attach = await Bun.file(join(root, "cli/cmd/tui/attach.ts")).text()
    const errorComponent = await Bun.file(join(root, "cli/cmd/tui/component/error-component.tsx")).text()
    const network = await Bun.file(join(root, "cli/network.ts")).text()
    const thread = await Bun.file(join(root, "cli/cmd/tui/thread.ts")).text()
    const web = await Bun.file(join(root, "cli/cmd/web.ts")).text()
    const upgrade = await Bun.file(join(root, "cli/cmd/upgrade.ts")).text()
    const mcp = await Bun.file(join(root, "cli/cmd/mcp.ts")).text()
    const config = await Bun.file(join(root, "config/config.ts")).text()
    const mdns = await Bun.file(join(root, "server/mdns.ts")).text()
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

    expect(run).toContain("run wiscode with a message")
    expect(run).not.toContain("run opencode with a message")

    expect(serve).toContain("starts a headless wiscode server")
    expect(serve).toContain("wiscode server listening on")
    expect(serve).not.toContain("headless opencode server")
    expect(serve).not.toContain("opencode server listening on")

    expect(attach).toContain("attach to a running wiscode server")
    expect(attach).not.toContain("attach to a running opencode server")

    expect(thread).toContain("start wiscode tui")
    expect(thread).toContain("path to start wiscode in")
    expect(thread).not.toContain("start opencode tui")
    expect(thread).not.toContain("path to start opencode in")

    expect(web).toContain("start wiscode server and open web interface")
    expect(web).not.toContain("start opencode server and open web interface")

    expect(upgrade).toContain("upgrade wiscode to the latest or a specific version")
    expect(upgrade).toContain("wiscode is installed to")
    expect(upgrade).toContain("wiscode upgrade skipped")
    expect(upgrade).not.toContain("upgrade opencode to the latest or a specific version")
    expect(upgrade).not.toContain("opencode is installed to")
    expect(upgrade).not.toContain("opencode upgrade skipped")

    expect(mcp).toContain("Add servers with: wiscode mcp add")
    expect(mcp).toContain("e.g., wiscode x @modelcontextprotocol/server-filesystem")
    expect(mcp).not.toContain("Add servers with: opencode mcp add")
    expect(mcp).not.toContain("e.g., opencode x @modelcontextprotocol/server-filesystem")

    expect(providers).toContain("wiscode auth provider")
    expect(providers).toContain("configure it in opencode.json.")
    expect(providers).not.toContain("opencode auth provider")
    expect(providers).not.toContain("https://opencode.ai/auth")
    expect(providers).not.toContain("https://opencode.ai/docs/providers/#cloudflare-ai-gateway")

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

    expect(github).toContain('console.log("WisCode session", session.id)')
    expect(github).toContain('console.log("Sending message to WisCode...")')
    expect(github).toContain("[WisCode session]")
    expect(github).toContain("WisCode infrastructure")
    expect(github).not.toContain("Learn more about the GitHub agent - https://opencode.ai/docs/github/#usage-examples")
    expect(github).not.toContain('console.log("opencode session", session.id)')
    expect(github).not.toContain('console.log("Sending message to opencode...")')
    expect(github).not.toContain("[opencode session]")
    expect(github).not.toContain("opencode infrastructure")

    expect(index).toContain('if (!text.startsWith("wiscode "))')
    expect(index).toContain('.scriptName("wiscode")')
    expect(index).not.toContain('if (!text.startsWith("opencode "))')
    expect(index).not.toContain('.scriptName("opencode")')

    expect(network).toContain("custom domain name for mDNS service (default: wiscode.local)")
    expect(network).toContain('default: "wiscode.local"')
    expect(network).not.toContain("default: opencode.local")
    expect(network).not.toContain('default: "opencode.local"')

    expect(config).toContain("Custom domain name for mDNS service (default: wiscode.local)")
    expect(config).not.toContain("Custom domain name for mDNS service (default: opencode.local)")

    expect(mdns).toContain('const host = domain ?? "wiscode.local"')
    expect(mdns).toContain('const name = `wiscode-${port}`')
    expect(mdns).not.toContain('const host = domain ?? "opencode.local"')
    expect(mdns).not.toContain('const name = `opencode-${port}`')

    expect(errorComponent).toContain("Copy error report")
    expect(errorComponent).not.toContain("https://github.com/anomalyco/opencode/issues/new?template=bug-report.yml")
    expect(errorComponent).not.toContain("opencode-version")
    expect(errorComponent).not.toContain("Copy issue URL")

    expect(provider).toContain("wiscode auth login <your provider URL>")
    expect(provider).not.toContain("opencode auth login <your provider URL>")

    expect(retry).toContain("Free usage exceeded for this WisCode plan")
    expect(retry).not.toContain("Free usage exceeded, subscribe to Go https://opencode.ai/go")

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
