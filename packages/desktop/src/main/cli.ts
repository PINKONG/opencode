import { app } from "electron"
import { copyFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"

const CLI_INSTALL_DIR = ".wiscode/bin"
const CLI_BINARY_NAME = "wiscode"
const CLI_SYNC_DONE_KEY = "cliSyncDone"

function shellName() {
  return path.basename(process.env.SHELL || "bash")
}

function shellConfigCandidates() {
  const home = os.homedir()
  const xdg = process.env.XDG_CONFIG_HOME || path.join(home, ".config")
  const shell = shellName()
  if (shell === "fish") return [path.join(home, ".config/fish/config.fish")]
  if (shell === "zsh") {
    const zdot = process.env.ZDOTDIR || home
    return [path.join(zdot, ".zshrc"), path.join(zdot, ".zshenv"), path.join(xdg, "zsh/.zshrc"), path.join(xdg, "zsh/.zshenv")]
  }
  if (shell === "ash" || shell === "sh") return [path.join(home, ".ashrc"), path.join(home, ".profile")]
  return [path.join(home, ".bashrc"), path.join(home, ".bash_profile"), path.join(home, ".profile"), path.join(xdg, "bash/.bashrc")]
}

function pathCommand(binDir: string) {
  return shellName() === "fish" ? `fish_add_path ${binDir}` : `export PATH=${binDir}:$PATH`
}

function cliExecutableName() {
  return process.platform === "win32" ? `${CLI_BINARY_NAME}.exe` : CLI_BINARY_NAME
}

function bundledCliName() {
  return process.platform === "win32" ? "wiscode-cli.exe" : "wiscode-cli"
}

export function getCliInstallPath() {
  return path.join(os.homedir(), CLI_INSTALL_DIR, cliExecutableName())
}

function getBundledCliPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, bundledCliName())
  const candidates = [
    path.join(app.getAppPath(), "resources", bundledCliName()),
    path.join(app.getAppPath(), "..", "resources", bundledCliName()),
    path.join(app.getAppPath(), "..", "..", "resources", bundledCliName()),
    path.join(process.cwd(), "resources", bundledCliName()),
  ]
  return candidates.find((item) => existsSync(item)) ?? candidates[0]
}

function ensurePathEntry(binDir: string) {
  if (process.platform === "win32") return
  if ((process.env.PATH || "").split(path.delimiter).includes(binDir)) return

  const command = pathCommand(binDir)
  const config = shellConfigCandidates().find((file) => existsSync(file)) || shellConfigCandidates()[0]
  if (!existsSync(config)) writeFileSync(config, "")
  const current = readFileSync(config, "utf8")
  if (current.includes(command)) return
  const prefix = current.endsWith("\n") || current.length === 0 ? "" : "\n"
  writeFileSync(config, `${current}${prefix}\n# wiscode\n${command}\n`)
}

function installCliWindows(sidecar: string) {
  const binDir = path.dirname(getCliInstallPath())
  mkdirSync(binDir, { recursive: true })
  copyFileSync(sidecar, getCliInstallPath())
}

function installCliUnix(sidecar: string) {
  const binDir = path.dirname(getCliInstallPath())
  mkdirSync(binDir, { recursive: true })
  copyFileSync(sidecar, getCliInstallPath())
  ensurePathEntry(binDir)
}

export async function installCli() {
  const sidecar = getBundledCliPath()
  if (!existsSync(sidecar)) throw new Error(`Bundled CLI not found: ${sidecar}`)

  if (process.platform === "win32") {
    installCliWindows(sidecar)
    return getCliInstallPath()
  }

  installCliUnix(sidecar)
  return getCliInstallPath()
}

export async function syncCli(store: { get: (key: string) => unknown; set: (key: string, value: unknown) => void }) {
  if (!app.isPackaged) return
  if (store.get(CLI_SYNC_DONE_KEY) === true && existsSync(getCliInstallPath())) return
  await installCli()
  store.set(CLI_SYNC_DONE_KEY, true)
}
