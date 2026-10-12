import { copyFileSync, cpSync, existsSync, renameSync, rmSync } from "node:fs"
import path from "node:path"

function uvName() {
  return process.platform === "win32" ? "uv.exe" : "uv"
}

export function hasCliResources(directory: string) {
  return [
    path.join(directory, uvName()),
    path.join(directory, "uv-LICENSE-MIT"),
    path.join(directory, "bmad", "SOURCE.json"),
    path.join(directory, "bmad", "skills", "bmad", "SKILL.md"),
  ].every((file) => existsSync(file))
}

export function installCliResources(source: string, target: string) {
  if (!hasCliResources(source)) throw new Error(`Bundled CLI resources not found: ${source}`)
  copyFileSync(path.join(source, uvName()), path.join(target, uvName()))
  copyFileSync(path.join(source, "uv-LICENSE-MIT"), path.join(target, "uv-LICENSE-MIT"))
  const stage = path.join(target, "bmad.tmp")
  rmSync(stage, { recursive: true, force: true })
  cpSync(path.join(source, "bmad"), stage, { recursive: true })
  rmSync(path.join(target, "bmad"), { recursive: true, force: true })
  renameSync(stage, path.join(target, "bmad"))
}
