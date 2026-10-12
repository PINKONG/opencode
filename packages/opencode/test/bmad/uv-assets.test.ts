import { expect, test } from "bun:test"
import { uvAssetForTarget, verifyVendoredUvArchives } from "../../script/uv-assets"
import path from "node:path"
import { mkdtemp, rm } from "node:fs/promises"
import os from "node:os"

test("uv assets cover desktop architectures with pinned hashes", () => {
  for (const target of ["darwin-arm64", "darwin-x64", "windows-arm64", "windows-x64"]) {
    const asset = uvAssetForTarget(target)
    expect(asset.archive).toMatch(/^uv-/)
    expect(asset.sha256).toMatch(/^[a-f0-9]{64}$/)
  }
})

test("uv assets cover Linux CLI architectures and libc variants", () => {
  for (const target of ["linux-arm64", "linux-x64", "linux-arm64-musl", "linux-x64-musl"]) {
    expect(uvAssetForTarget(target).sha256).toMatch(/^[a-f0-9]{64}$/)
  }
})

test("unknown uv targets fail closed", () => {
  expect(() => uvAssetForTarget("plan9-arm64")).toThrow("Unsupported uv target")
})

test("bundled uv license is available for redistribution", async () => {
  const license = path.resolve(import.meta.dirname, "../../../../third_party/uv/LICENSE-MIT")
  expect(await Bun.file(license).text()).toContain("MIT License")
})

test("all supported uv archives are vendored with matching checksums", async () => {
  await expect(verifyVendoredUvArchives()).resolves.toBeUndefined()
})

test("offline uv preflight fails when vendor archives are missing", async () => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "wiscode-uv-empty-"))
  try {
    await expect(verifyVendoredUvArchives(directory)).rejects.toThrow("Vendored uv archive missing")
  } finally {
    await rm(directory, { recursive: true, force: true })
  }
})
