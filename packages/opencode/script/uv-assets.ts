import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { chmod, copyFile, mkdir, mkdtemp, readFile, rm } from "node:fs/promises"
import { existsSync } from "node:fs"

export const UV_VERSION = "0.6.13"

const assets: Record<string, { archive: string; sha256: string }> = {
  "darwin-x64": { archive: "uv-x86_64-apple-darwin.tar.gz", sha256: "ed240854d97f7b234082f5a0ce734869a4310d86d46a819860bbce6d7df8b2eb" },
  "darwin-arm64": { archive: "uv-aarch64-apple-darwin.tar.gz", sha256: "0ddb8458634cc3a02799b6da839cb546dff9dabc6f3394912c48dd479016683b" },
  "windows-x64": { archive: "uv-x86_64-pc-windows-msvc.zip", sha256: "19bb08768fd3b8664068cc45faa633ee110bfef4215e560bc1e5833b1bc6c30e" },
  "windows-arm64": { archive: "uv-aarch64-pc-windows-msvc.zip", sha256: "3f3d6aa73b4859469fa3ad7efca3e5d0dba1112292c91d5c5f740983f16a8d8a" },
  "linux-x64": { archive: "uv-x86_64-unknown-linux-gnu.tar.gz", sha256: "f6788fd45a25ea1033a671eaa9ece6c9b004ce5c9cf09552effadde567a7d7a5" },
  "linux-arm64": { archive: "uv-aarch64-unknown-linux-gnu.tar.gz", sha256: "ac0c723663ff76183077cc9aa91dcd0b5100081d87f93e1ba482930e0a584e90" },
  "linux-x64-musl": { archive: "uv-x86_64-unknown-linux-musl.tar.gz", sha256: "779560faf6a21b5a6dbc2664c2dfbde2b9387b1f486c9197a9f4d143a3b66875" },
  "linux-arm64-musl": { archive: "uv-aarch64-unknown-linux-musl.tar.gz", sha256: "379a5c48f6e3eb32c2d16022c0a4fc10cdfcca3543b75e2e9d819d62fead6a75" },
}

export function uvAssetForTarget(target: string) {
  const asset = assets[target]
  if (!asset) throw new Error(`Unsupported uv target: ${target}`)
  return asset
}

export async function verifyVendoredUvArchives(directory = path.resolve(import.meta.dirname, "../../../third_party/uv", `v${UV_VERSION}`)) {
  for (const asset of Object.values(assets)) {
    const archive = path.join(directory, asset.archive)
    if (!existsSync(archive)) throw new Error(`Vendored uv archive missing: ${archive}`)
    const digest = createHash("sha256").update(await readFile(archive)).digest("hex")
    if (digest !== asset.sha256) throw new Error(`Vendored uv checksum mismatch: ${archive}`)
  }
}

export async function copyUvForTarget(target: string, destination: string) {
  const asset = uvAssetForTarget(target)
  const root = path.resolve(import.meta.dirname, "../../..")
  const archive = path.join(root, "third_party", "uv", `v${UV_VERSION}`, asset.archive)
  if (!existsSync(archive)) throw new Error(`Vendored uv archive missing: ${archive}`)
  const digest = createHash("sha256").update(await readFile(archive)).digest("hex")
  if (digest !== asset.sha256) throw new Error(`Vendored uv checksum mismatch: ${archive}`)
  const temp = await mkdtemp(path.join(os.tmpdir(), "wiscode-uv-"))
  try {
    const command = asset.archive.endsWith(".zip")
      ? process.platform === "win32"
        ? ["powershell", "-NoProfile", "-Command", "Expand-Archive", "-LiteralPath", archive, "-DestinationPath", temp]
        : ["unzip", "-q", archive, "-d", temp]
      : ["tar", "-xzf", archive, "-C", temp]
    const child = Bun.spawn(command, { stdout: "pipe", stderr: "pipe" })
    const stderr = await new Response(child.stderr).text()
    if ((await child.exited) !== 0) throw new Error(`Unable to extract bundled uv: ${stderr}`)
    const binary = Array.from(new Bun.Glob("**/uv{,.exe}").scanSync({ cwd: temp, absolute: true }))[0]
    if (!binary) throw new Error(`uv executable missing from ${archive}`)
    await mkdir(path.dirname(destination), { recursive: true })
    await copyFile(binary, destination)
    await copyFile(path.join(root, "third_party", "uv", "LICENSE-MIT"), path.join(path.dirname(destination), "uv-LICENSE-MIT"))
    if (process.platform !== "win32") await chmod(destination, 0o755)
  } finally {
    await rm(temp, { recursive: true, force: true })
  }
}
