import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../src")
const tuiRoot = resolve(dir, "../../../tui/src")
const cliRoot = resolve(dir, "../../../cli/src")

function read(root: string, name: string) {
  return Bun.file(join(root, name)).text()
}

const branded = [
  "acp/agent.ts",
  "mcp/oauth-callback.ts",
  "cli/cmd/mcp.ts",
  "cli/cmd/pr.ts",
  "cli/cmd/providers.ts",
  "cli/cmd/run.ts",
  "cli/cmd/serve.ts",
  "cli/cmd/attach.ts",
  "cli/cmd/upgrade.ts",
  "cli/cmd/web.ts",
  "cli/cmd/tui.ts",
  "cli/cmd/uninstall.ts",
  "cli/network.ts",
  "server/mdns.ts",
  "cli/error.ts",
  "provider/error.ts",
  "mcp/oauth-provider.ts",
]

const brandedTui = ["component/error-component.tsx", "component/dialog-status.tsx", "util/presentation.ts"]

describe("user visible branding copy", () => {
  for (const name of branded) {
    test(`${name} does not expose old OpenCode branding`, async () => {
      const txt = await read(root, name)

      expect(txt).not.toContain("OpenCode")
      expect(txt).not.toContain("opencode.ai")
    })
  }

  for (const name of brandedTui) {
    test(`tui/${name} does not expose old OpenCode branding`, async () => {
      const txt = await read(tuiRoot, name)

      expect(txt).not.toContain("OpenCode")
      expect(txt).not.toContain("opencode.ai")
    })
  }

  test("cli-facing guidance uses wiscode command examples", async () => {
    const error = await read(root, "cli/error.ts")
    const newCliCommands = await read(cliRoot, "commands/commands.ts")
    const pr = await read(root, "cli/cmd/pr.ts")
    const github = await read(root, "cli/cmd/github.handler.ts")
    const index = await read(root, "index.ts")
    const temporary = await read(root, "temporary.ts")
    const providers = await read(root, "cli/cmd/providers.ts")
    const retry = await read(root, "session/retry.ts")
    const run = await read(root, "cli/cmd/run.ts")
    const serve = await read(root, "cli/cmd/serve.ts")
    const attach = await read(root, "cli/cmd/attach.ts")
    const errorComponent = await read(tuiRoot, "component/error-component.tsx")
    const network = await read(root, "cli/network.ts")
    const thread = await read(root, "cli/cmd/tui.ts")
    const web = await read(root, "cli/cmd/web.ts")
    const upgrade = await read(root, "cli/cmd/upgrade.ts")
    const mcp = await read(root, "cli/cmd/mcp.ts")
    const mdns = await read(root, "server/mdns.ts")
    const status = await read(tuiRoot, "component/dialog-status.tsx")
    const session = await read(tuiRoot, "util/presentation.ts")
    const acp = await read(root, "acp/service.ts")
    const provider = await read(root, "provider/error.ts")
    const tips = await read(tuiRoot, "feature-plugins/home/tips-view.tsx")
    const tuiError = await read(tuiRoot, "util/error.ts")

    expect(newCliCommands).toContain("WisCode 2.0 preview command line interface")
    expect(newCliCommands).not.toContain("OpenCode 2.0 preview command line interface")

    expect(error).toContain("wiscode models")
    expect(error).toContain("wiscode auth login")
    expect(error).not.toContain("opencode models")
    expect(error).not.toContain("opencode auth login")

    expect(tuiError).toContain("wiscode models")
    expect(tuiError).toContain("wiscode.json")
    expect(tuiError).toContain("WisCode does not support MCP authentication yet")
    expect(tuiError).not.toContain("opencode models")
    expect(tuiError).not.toContain("opencode.json")
    expect(tuiError).not.toContain("opencode does not support MCP authentication yet")

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
    expect(providers).toContain("configure it in wiscode.json.")
    expect(providers).toContain("Configure via wiscode.json options (profile, region, endpoint) or")
    expect(providers).not.toContain("opencode auth provider")
    expect(providers).not.toContain("configure it in opencode.json.")
    expect(providers).not.toContain("Configure via opencode.json options (profile, region, endpoint) or")
    expect(providers).not.toContain("https://opencode.ai/auth")
    expect(providers).not.toContain("https://opencode.ai/docs/providers/#cloudflare-ai-gateway")
    expect(providers).not.toContain("Configure the provider in opencode.json to use it.")

    expect(status).toContain("Needs authentication (run: wiscode mcp auth {key})")
    expect(status).not.toContain("Needs authentication (run: opencode mcp auth {key})")

    expect(session).toContain("wiscode -s ${input.sessionID}")
    expect(session).not.toContain("opencode -s ${input.sessionID}")

    expect(acp).toContain("Run `wiscode auth login` in the terminal")
    expect(acp).toContain('name: "Login with WisCode"')
    expect(acp).toContain('command: "wiscode"')
    expect(acp).toContain("WisCode prompt failed")
    expect(acp).not.toContain("Run `opencode auth login` in the terminal")
    expect(acp).not.toContain('name: "Login with opencode"')
    expect(acp).not.toContain('command: "opencode"')
    expect(acp).not.toContain("OpenCode prompt failed")

    expect(github).toContain('console.log("WisCode session", session.id)')
    expect(github).toContain('console.log("Sending message to WisCode...")')
    expect(github).toContain("[WisCode session]")
    expect(github).toContain("WisCode infrastructure")
    expect(github).toContain("name: wiscode")
    expect(github).toContain("uses: PINKONG/opencode/github@latest")
    expect(github).toContain("contains(github.event.comment.body, ' /wiscode')")
    expect(github).toContain("startsWith(github.event.comment.body, '/wiscode')")
    expect(github).toContain('const WORKFLOW_FILE = ".github/workflows/wiscode.yml"')
    expect(github).toContain('process.env["MENTIONS"] || "/wiscode,/oc"')
    expect(github).toContain("return `wiscode/${type}-${hex}-${timestamp}`")
    expect(github).toContain("return `wiscode/${type}${issueId}-${timestamp}`")
    expect(github).toContain("https://social-cards.sst.dev/wiscode-share/")
    expect(github).not.toContain("Learn more about the GitHub agent - https://opencode.ai/docs/github/#usage-examples")
    expect(github).not.toContain('console.log("opencode session", session.id)')
    expect(github).not.toContain('console.log("Sending message to opencode...")')
    expect(github).not.toContain("[opencode session]")
    expect(github).not.toContain("opencode infrastructure")
    expect(github).not.toContain("uses: anomalyco/opencode/github@latest")
    expect(github).not.toContain("contains(github.event.comment.body, ' /opencode')")
    expect(github).not.toContain("startsWith(github.event.comment.body, '/opencode')")

    expect(index).toContain('if (!text.startsWith("wiscode "))')
    expect(index).toContain('.scriptName("wiscode")')
    expect(index).not.toContain('if (!text.startsWith("opencode "))')
    expect(index).not.toContain('.scriptName("opencode")')

    expect(temporary).toContain('.scriptName("wiscode")')
    expect(temporary).not.toContain('.scriptName("opencode")')

    expect(network).toContain("custom domain name for mDNS service (default: wiscode.local)")
    expect(network).toContain('default: "wiscode.local"')
    expect(network).not.toContain("default: opencode.local")
    expect(network).not.toContain('default: "opencode.local"')

    expect(mdns).toContain('const host = domain ?? "wiscode.local"')
    expect(mdns).toContain('const name = `wiscode-${port}`')
    expect(mdns).not.toContain('const host = domain ?? "opencode.local"')
    expect(mdns).not.toContain('const name = `opencode-${port}`')

    expect(errorComponent).toContain("Copy report")
    expect(errorComponent).toContain("wiscode-version")
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

  test("provider-branded surfaces keep upstream OpenCode Zen/Go names", async () => {
    const dialogProvider = await read(tuiRoot, "component/dialog-provider.tsx")
    const retry = await read(root, "session/retry.ts")
    const tips = await read(tuiRoot, "feature-plugins/home/tips-view.tsx")

    expect(dialogProvider).toContain("OpenCode Zen")
    expect(dialogProvider).toContain("OpenCode Go")
    expect(dialogProvider).not.toContain("WisCode Zen")
    expect(dialogProvider).not.toContain("WisCode Go")

    expect(retry).toContain("Subscribe to OpenCode Go")
    expect(retry).not.toContain("Subscribe to WisCode Go")

    expect(tips).toContain("Use {highlight}/connect{/highlight} with OpenCode Zen for curated, tested models")
    expect(tips).not.toContain("Use {highlight}/connect{/highlight} with WisCode Zen")
  })
})
