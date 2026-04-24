import { $ } from "bun"
import { existsSync } from "node:fs"
import path from "node:path"

export type Channel = "dev" | "beta" | "prod"

export function resolveChannel(): Channel {
  const raw = Bun.env.OPENCODE_CHANNEL
  if (raw === "dev" || raw === "beta" || raw === "prod") return raw
  return "dev"
}

export const SIDECAR_BINARIES: Array<{ rustTarget: string; ocBinary: string; assetExt: string }> = [
  {
    rustTarget: "aarch64-apple-darwin",
    ocBinary: "wiscode-cli-darwin-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-apple-darwin",
    ocBinary: "wiscode-cli-darwin-x64-baseline",
    assetExt: "zip",
  },
  {
    rustTarget: "aarch64-pc-windows-msvc",
    ocBinary: "wiscode-cli-windows-arm64",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-pc-windows-msvc",
    ocBinary: "wiscode-cli-windows-x64-baseline",
    assetExt: "zip",
  },
  {
    rustTarget: "x86_64-unknown-linux-gnu",
    ocBinary: "wiscode-cli-linux-x64-baseline",
    assetExt: "tar.gz",
  },
  {
    rustTarget: "aarch64-unknown-linux-gnu",
    ocBinary: "wiscode-cli-linux-arm64",
    assetExt: "tar.gz",
  },
]

export const RUST_TARGET = Bun.env.RUST_TARGET
const NODE_VERSION = "24.14.0"

function nativeTarget() {
  const { platform, arch } = process
  if (platform === "darwin") return arch === "arm64" ? "aarch64-apple-darwin" : "x86_64-apple-darwin"
  if (platform === "win32") return arch === "arm64" ? "aarch64-pc-windows-msvc" : "x86_64-pc-windows-msvc"
  if (platform === "linux") return arch === "arm64" ? "aarch64-unknown-linux-gnu" : "x86_64-unknown-linux-gnu"
  throw new Error(`Unsupported platform: ${platform}/${arch}`)
}

export function getCurrentSidecar(target = RUST_TARGET ?? nativeTarget()) {
  const binaryConfig = SIDECAR_BINARIES.find((b) => b.rustTarget === target)
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

function extractNode(archive: string, output: string) {
  if (archive.endsWith(".zip") && process.platform === "win32") {
    const command = `Expand-Archive -LiteralPath '${archive.replaceAll("'", "''")}' -DestinationPath '${output.replaceAll("'", "''")}' -Force`
    return $`powershell -NoLogo -NoProfile -ExecutionPolicy Bypass -Command ${command}`
  }
  if (archive.endsWith(".zip")) return $`unzip -q -o ${archive} -d ${output}`
  if (archive.endsWith(".tar.xz")) return $`tar -xJf ${archive} -C ${output}`
  return $`tar -xzf ${archive} -C ${output}`
}

export async function ensureBundledNodeBinary(target = RUST_TARGET ?? nativeTarget()) {
  const archiveName = nodeArchive(target)
  const distName = nodeDistName(target)
  const dir = path.join("resources", "node-cache")
  const vendor = path.join("..", "..", "third_party", "node", `v${NODE_VERSION}`)
  const archivePath = path.join(dir, archiveName)
  const vendoredArchive = path.join(vendor, archiveName)
  const distPath = path.join(dir, distName)
  await $`mkdir -p ${dir}`
  if (!existsSync(archivePath) && existsSync(vendoredArchive)) await $`cp ${vendoredArchive} ${archivePath}`
  if (!existsSync(archivePath)) {
    const url = `https://nodejs.org/dist/v${NODE_VERSION}/${archiveName}`
    await $`curl -fL ${url} -o ${archivePath}`
  }
  if (!existsSync(distPath)) await extractNode(archivePath, dir)
  return target.includes("windows") ? path.join(distPath, "node.exe") : path.join(distPath, "bin", "node")
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

export function windowsify(path: string) {
  if (path.endsWith(".exe")) return path
  return `${path}${process.platform === "win32" ? ".exe" : ""}`
}
