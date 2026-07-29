import { $ } from "bun"
import { existsSync } from "node:fs"
import path from "node:path"

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  const raw = Bun.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
}

const NODE_VERSION = "24.14.0"
const RIPGREP_VERSION = "15.1.0"

export const SIDECAR_BINARIES: Array<{
  rustTarget: string
  ocBinary: string
  assetExt: string
  nodeDist: string
  nodeArchive: string
  ripgrepArchive: string
}> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "wiscode-cli-darwin-arm64",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-darwin-arm64`,
    nodeArchive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
    ripgrepArchive: `ripgrep-${RIPGREP_VERSION}-aarch64-apple-darwin.tar.gz`,
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "wiscode-cli-darwin-x64-baseline",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-darwin-x64`,
    nodeArchive: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
    ripgrepArchive: `ripgrep-${RIPGREP_VERSION}-x86_64-apple-darwin.tar.gz`,
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "wiscode-cli-windows-arm64",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-win-arm64`,
    nodeArchive: `node-v${NODE_VERSION}-win-arm64.zip`,
    ripgrepArchive: `ripgrep-${RIPGREP_VERSION}-aarch64-pc-windows-msvc.zip`,
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "wiscode-cli-windows-x64-baseline",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-win-x64`,
    nodeArchive: `node-v${NODE_VERSION}-win-x64.zip`,
    ripgrepArchive: `ripgrep-${RIPGREP_VERSION}-x86_64-pc-windows-msvc.zip`,
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "wiscode-cli-linux-x64-baseline",
    assetExt: "tar.gz",
    nodeDist: `node-v${NODE_VERSION}-linux-x64`,
    nodeArchive: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
    ripgrepArchive: `ripgrep-${RIPGREP_VERSION}-x86_64-unknown-linux-musl.tar.gz`,
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "wiscode-cli-linux-arm64",
    assetExt: "tar.gz",
    nodeDist: `node-v${NODE_VERSION}-linux-arm64`,
    nodeArchive: `node-v${NODE_VERSION}-linux-arm64.tar.xz`,
    ripgrepArchive: `ripgrep-${RIPGREP_VERSION}-aarch64-unknown-linux-gnu.tar.gz`,
  },
]

export const RUST_TARGET = process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.RUST_TARGET

function nativeTarget() {
  const { platform, arch } = process
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc"
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"
  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

export function getCurrentSidecar(target = RUST_TARGET ?? nativeTarget()) {
  const binaryConfig = SIDECAR_BINARIES.find((item) => item.rustTarget === target)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${target}'`)

  return binaryConfig
}

export async function copyBinaryToSidecarFolder(source: string) {
  const dir = `resources`
  await $`mkdir -p ${dir}`
  const dest = windowsify(`${dir}/wiscode-cli`)
  await $`cp ${source} ${dest}`
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  if (process.platform === "darwin") {
    await $`codesign --remove-signature ${dest}`.nothrow()
    await $`codesign --force --sign - ${dest}`
  }

  console.log(`Copied ${source} to ${dest}`)
}

function nodeArchive(target = RUST_TARGET ?? nativeTarget()) {
  if (target === "aarch64-apple-darwin") return `node-v${NODE_VERSION}-darwin-arm64.tar.gz`
  if (target === "x86_64-apple-darwin") return `node-v${NODE_VERSION}-darwin-x64.tar.gz`
  if (target === "aarch64-pc-windows-msvc") return `node-v${NODE_VERSION}-win-arm64.zip`
  if (target === "x86_64-pc-windows-msvc") return `node-v${NODE_VERSION}-win-x64.zip`
  if (target === "x86_64-unknown-linux-gnu") return `node-v${NODE_VERSION}-linux-x64.tar.xz`
  if (target === "aarch64-unknown-linux-gnu") return `node-v${NODE_VERSION}-linux-arm64.tar.xz`
  throw new Error(`Unsupported target for node archive: ${target}`)
}

function nodeDistName(target = RUST_TARGET ?? nativeTarget()) {
  return nodeArchive(target).replace(/(\.tar\.gz|\.tar\.xz|\.zip)$/, "")
}

async function extractZip(archive: string, dir: string) {
  if (process.platform !== "win32") {
    await $`unzip -q -o ${archive} -d ${dir}`
    return
  }

  const ps = (value: string) => `'${value.replaceAll("'", "''")}'`
  const proc = Bun.spawn(
    [
      "powershell.exe",
      "-NoLogo",
      "-NoProfile",
      "-ExecutionPolicy",
      "Bypass",
      "-Command",
      `Expand-Archive -LiteralPath ${ps(archive)} -DestinationPath ${ps(dir)} -Force`,
    ],
    {
      stdout: "inherit",
      stderr: "inherit",
    },
  )
  const exitCode = await proc.exited
  if (exitCode !== 0) throw new Error(`Failed to extract ${archive}`)
}

export async function ensureBundledNodeBinary(target?: string) {
  const resolvedTarget = target ?? RUST_TARGET ?? nativeTarget()
  const archiveName = nodeArchive(resolvedTarget)
  const distName = nodeDistName(resolvedTarget)
  const dir = path.join("resources", "node-cache")
  const vendor = path.join("..", "..", "third_party", "node", `v${NODE_VERSION}`)
  const archive = path.join(dir, archiveName)
  const vendoredArchive = path.join(vendor, archiveName)
  const extracted = path.join(dir, distName)
  await $`mkdir -p ${dir}`
  if (!existsSync(archive) && existsSync(vendoredArchive)) await $`cp ${vendoredArchive} ${archive}`
  if (!existsSync(archive)) {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`
    await $`curl -fL ${url} -o ${archive}`
  }
  if (!existsSync(extracted)) {
    if (archiveName.endsWith(".zip")) await extractZip(archive, dir)
    else if (archiveName.endsWith(".tar.xz")) await $`tar -xJf ${archive} -C ${dir}`
    else await $`tar -xzf ${archive} -C ${dir}`
  }
  return resolvedTarget.includes("windows")
    ? path.join(extracted, "node.exe")
    : path.join(extracted, "bin", "node")
}

export async function copyBundledNodeToResources(source: string) {
  const dir = `resources`
  await $`mkdir -p ${dir}`
  const dest = windowsify(`${dir}/wiscode-node`)
  await $`cp ${source} ${dest}`
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  if (process.platform === "darwin") {
    await $`codesign --remove-signature ${dest}`.nothrow()
    await $`codesign --force --sign - ${dest}`
  }
  console.log(`Copied ${source} to ${dest}`)
}

export async function ensureBundledRipgrepBinary(target?: string) {
  const resolvedTarget = target ?? RUST_TARGET ?? nativeTarget()
  const binaryConfig = getCurrentSidecar(resolvedTarget)
  const archiveName = binaryConfig.ripgrepArchive
  const distName = archiveName.replace(/(\.tar\.gz|\.zip)$/, "")
  const dir = path.join("resources", "ripgrep-cache")
  const vendor = path.join("..", "..", "third_party", "ripgrep", `v${RIPGREP_VERSION}`)
  const archive = path.join(dir, archiveName)
  const vendoredArchive = path.join(vendor, archiveName)
  const extracted = path.join(dir, distName)
  await $`mkdir -p ${dir}`
  if (!existsSync(archive) && existsSync(vendoredArchive)) await $`cp ${vendoredArchive} ${archive}`
  if (!existsSync(archive)) {
    const url = `https://github.com/BurntSushi/ripgrep/releases/download/${RIPGREP_VERSION}/${archiveName}`
    await $`curl -fL ${url} -o ${archive}`
  }
  if (!existsSync(extracted)) {
    if (archiveName.endsWith(".zip")) await extractZip(archive, dir)
    else await $`tar -xzf ${archive} -C ${dir}`
  }
  return resolvedTarget.includes("windows") ? path.join(extracted, "rg.exe") : path.join(extracted, "rg")
}

export async function copyBundledRipgrepToResources(source: string) {
  const dir = `resources`
  await $`mkdir -p ${dir}`
  const dest = windowsify(`${dir}/rg`)
  await $`cp ${source} ${dest}`
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }
  if (process.platform === "darwin") {
    await $`codesign --remove-signature ${dest}`.nothrow()
    await $`codesign --force --sign - ${dest}`
  }
  console.log(`Copied ${source} to ${dest}`)
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
