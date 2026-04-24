import { $ } from "bun"
import { existsSync } from "node:fs"
import path from "node:path"

const NODE_VERSION = "24.14.0"

export const SIDECAR_BINARIES: Array<{
  rustTarget: string
  ocBinary: string
  assetExt: string
  nodeDist: string
  nodeArchive: string
}> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "wiscode-cli-darwin-arm64",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-darwin-arm64`,
    nodeArchive: `node-v${NODE_VERSION}-darwin-arm64.tar.gz`,
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "wiscode-cli-darwin-x64-baseline",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-darwin-x64`,
    nodeArchive: `node-v${NODE_VERSION}-darwin-x64.tar.gz`,
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "wiscode-cli-windows-arm64",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-win-arm64`,
    nodeArchive: `node-v${NODE_VERSION}-win-arm64.zip`,
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "wiscode-cli-windows-x64-baseline",
    assetExt: "zip",
    nodeDist: `node-v${NODE_VERSION}-win-x64`,
    nodeArchive: `node-v${NODE_VERSION}-win-x64.zip`,
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "wiscode-cli-linux-x64-baseline",
    assetExt: "tar.gz",
    nodeDist: `node-v${NODE_VERSION}-linux-x64`,
    nodeArchive: `node-v${NODE_VERSION}-linux-x64.tar.xz`,
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "wiscode-cli-linux-arm64",
    assetExt: "tar.gz",
    nodeDist: `node-v${NODE_VERSION}-linux-arm64`,
    nodeArchive: `node-v${NODE_VERSION}-linux-arm64.tar.xz`,
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

function resolveTarget(target?: string) {
  return target ?? process.env.TAURI_ENV_TARGET_TRIPLE ?? process.env.RUST_TARGET ?? nativeTarget()
}

export function getCurrentSidecar(target?: string) {
  const resolvedTarget = resolveTarget(target)
  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === resolvedTarget)
  if (!binaryConfig) throw new Error(`Sidecar configuration not available for Rust target '${resolvedTarget}'`)

  return binaryConfig
}

export async function copyBinaryToSidecarFolder(source: string, target?: string, sidecar = "wiscode-cli") {
  const resolvedTarget = resolveTarget(target)
  await $`mkdir -p src-tauri/sidecars`
  const dest = windowsify(`src-tauri/sidecars/${sidecar}-${resolvedTarget}`)
  await $`cp ${source} ${dest}`
  if (process.platform === "win32" && process.env.GITHUB_ACTIONS === "true") {
    await $`pwsh -NoLogo -NoProfile -ExecutionPolicy Bypass -File ../../script/sign-windows.ps1 ${dest}`
  }

  console.log(`Copied ${source} to ${dest}`)
}

function extractNode(archive: string, output: string) {
  if (archive.endsWith(".zip") && process.platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${output.replaceAll("'", "''")}' -Force`
    return $`powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ${command}`
  }
  if (archive.endsWith(".zip")) return $`unzip -q -o ${archive} -d ${output}`
  if (archive.endsWith(".tar.xz")) return $`tar -xJf ${archive} -C ${output}`
  return $`tar -xzf ${archive} -C ${output}`
}

export async function ensureBundledNodeBinary(target?: string) {
  const sidecar = getCurrentSidecar(target)
  const dir = path.join("src-tauri/target/opencode-binaries", "node")
  const vendor = path.join("..", "..", "third_party", "node", `v${NODE_VERSION}`)
  const archive = path.join(dir, sidecar.nodeArchive)
  const vendoredArchive = path.join(vendor, sidecar.nodeArchive)
  const extracted = path.join(dir, sidecar.nodeDist)
  const url = `https://nodejs.org/dist/v${NODE_VERSION}/${sidecar.nodeArchive}`
  await $`mkdir -p ${dir}`
  if (!existsSync(archive) && existsSync(vendoredArchive)) await $`cp ${vendoredArchive} ${archive}`
  if (!existsSync(archive)) await $`curl -fL ${url} -o ${archive}`
  if (!existsSync(extracted)) await extractNode(archive, dir)
  return sidecar.rustTarget.includes("windows")
    ? path.join(extracted, "node.exe")
    : path.join(extracted, "bin", "node")
}

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
