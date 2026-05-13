import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "server.ts")
const src = await Bun.file(file).text()
const ipc = await Bun.file(join(dir, "ipc.ts")).text()
const main = await Bun.file(join(dir, "index.ts")).text()
const cli = await Bun.file(join(dir, "cli.ts")).text()
const builder = await Bun.file(join(dir, "../../electron-builder.config.ts")).text()
const nsis = await Bun.file(join(dir, "../../resources/nsis-installer.nsh")).text()

describe("electron cli install path", () => {
  test("installs wiscode into the wiscode namespace", () => {
    expect(src).toContain("preferAppEnv")
    expect(src).toContain('XDG_STATE_HOME: process.env.XDG_STATE_HOME ?? userDataPath')
    expect(src).toContain('OPENCODE_CLIENT: "desktop"')
    expect(src).toContain("WISCODE_BUNDLED_NODE_PATH")
    expect(src).toContain("resolveBundledNodePath")
    expect(src).toContain('join(app.getAppPath(), "resources", executable)')
  })

  test("exposes install-cli over ipc and syncs cli on startup", () => {
    expect(ipc).toContain('ipcMain.handle("install-cli"')
    expect(main).toContain("syncCli()")
    expect(cli).toContain('execFile(cliPath, ["--version"], { windowsHide: true }')
    expect(cli).toContain("app.getVersion()")
    expect(cli).not.toContain("cliSyncDone")
  })

  test("windows installer overwrites bundled cli and repairs PATH", () => {
    expect(builder).toContain('include: "resources/nsis-installer.nsh"')
    expect(nsis).toContain("!macro customInstall")
    expect(nsis).toContain('$INSTDIR\\resources\\wiscode-cli.exe')
    expect(nsis).toContain('$WisCodeCliDir\\wiscode.exe')
    expect(nsis).toContain('WriteRegExpandStr HKCU "Environment" "Path"')
    expect(nsis).toContain("!macro customUnInstall")
  })
})
