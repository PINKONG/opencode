import { app } from "electron"
import { execFile, spawnSync } from "node:child_process"
import { copyFileSync, existsSync, mkdirSync, readFileSync, renameSync, unlinkSync, writeFileSync } from "node:fs"
import os from "node:os"
import path from "node:path"
import { hasCliResources, installCliResources } from "./cli-resources"

const CLI_INSTALL_DIR = ".wiscode/bin"
const CLI_BINARY_NAME = "wiscode"

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

function bundledRipgrepName() {
  return process.platform === "win32" ? "rg.exe" : "rg"
}

function wiscodeCacheBinDir() {
  if (process.env.XDG_CACHE_HOME) return path.join(process.env.XDG_CACHE_HOME, "wiscode", "bin")
  if (process.platform === "darwin") return path.join(os.homedir(), "Library", "Caches", "wiscode", "bin")
  return path.join(os.homedir(), ".cache", "wiscode", "bin")
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

function getBundledRipgrepPath() {
  if (app.isPackaged) return path.join(process.resourcesPath, bundledRipgrepName())
  const candidates = [
    path.join(app.getAppPath(), "resources", bundledRipgrepName()),
    path.join(app.getAppPath(), "..", "resources", bundledRipgrepName()),
    path.join(app.getAppPath(), "..", "..", "resources", bundledRipgrepName()),
    path.join(process.cwd(), "resources", bundledRipgrepName()),
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
  const target = getCliInstallPath()
  const temp = `${target}.tmp`
  if (existsSync(temp)) unlinkSync(temp)
  copyFileSync(sidecar, temp)
  renameSync(temp, target)
}

function installCliUnix(sidecar: string) {
  const binDir = path.dirname(getCliInstallPath())
  mkdirSync(binDir, { recursive: true })
  const target = getCliInstallPath()
  const temp = `${target}.tmp`
  if (existsSync(temp)) unlinkSync(temp)
  copyFileSync(sidecar, temp)
  if (process.platform === "darwin") {
    const verify = spawnSync("codesign", ["--verify", "--verbose=2", temp], { encoding: "utf8" })
    if (verify.status !== 0) {
      const remove = spawnSync("codesign", ["--remove-signature", temp], { encoding: "utf8" })
      if (remove.status !== 0) throw new Error(`codesign remove failed: ${(remove.stderr || remove.stdout || "").trim()}`)
      const sign = spawnSync("codesign", ["--force", "--sign", "-", temp], { encoding: "utf8" })
      if (sign.status !== 0) throw new Error(`codesign ad-hoc sign failed: ${(sign.stderr || sign.stdout || "").trim()}`)
    }
  }
  renameSync(temp, target)
  ensurePathEntry(binDir)
}

function parseVersion(output: string) {
  return output.match(/\d+\.\d+\.\d+(?:[-+][0-9A-Za-z.-]+)?/)?.[0] ?? null
}

function cliVersion(cliPath: string) {
  return new Promise<string | null>((resolve) => {
    execFile(cliPath, ["--version"], { windowsHide: true }, (error, stdout, stderr) => {
      if (error) {
        resolve(null)
        return
      }
      resolve(parseVersion(`${stdout}\n${stderr}`))
    })
  })
}

export async function installCli() {
  const sidecar = getBundledCliPath()
  if (!existsSync(sidecar)) throw new Error(`Bundled CLI not found: ${sidecar}`)
  const resources = path.dirname(sidecar)
  if (!hasCliResources(resources)) throw new Error(`Bundled CLI resources not found: ${resources}`)

  if (process.platform === "win32") {
    installCliWindows(sidecar)
    installCliResources(resources, path.dirname(getCliInstallPath()))
    return getCliInstallPath()
  }

  installCliUnix(sidecar)
  installCliResources(resources, path.dirname(getCliInstallPath()))
  return getCliInstallPath()
}

export async function syncCli() {
  if (!app.isPackaged) return
  if ((await cliVersion(getCliInstallPath())) === app.getVersion() &&
    hasCliResources(path.dirname(getCliInstallPath()))) return
  await installCli()
}

export async function syncRipgrep() {
  if (!app.isPackaged) return
  const source = getBundledRipgrepPath()
  if (!existsSync(source)) throw new Error(`Bundled ripgrep not found: ${source}`)
  const binDir = wiscodeCacheBinDir()
  mkdirSync(binDir, { recursive: true })
  const target = path.join(binDir, bundledRipgrepName())
  const temp = `${target}.tmp`
  if (existsSync(temp)) unlinkSync(temp)
  copyFileSync(source, temp)
  if (process.platform === "darwin") {
    const verify = spawnSync("codesign", ["--verify", "--verbose=2", temp], { encoding: "utf8" })
    if (verify.status !== 0) {
      const remove = spawnSync("codesign", ["--remove-signature", temp], { encoding: "utf8" })
      if (remove.status !== 0) throw new Error(`codesign remove failed: ${(remove.stderr || remove.stdout || "").trim()}`)
      const sign = spawnSync("codesign", ["--force", "--sign", "-", temp], { encoding: "utf8" })
      if (sign.status !== 0) throw new Error(`codesign ad-hoc sign failed: ${(sign.stderr || sign.stdout || "").trim()}`)
    }
  }
  renameSync(temp, target)
}
