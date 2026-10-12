import path from "node:path"
import { existsSync } from "node:fs"

export function bundledBMAD() {
  const bin = path.dirname(process.execPath)
  const source = process.env.WISCODE_BMAD_SKILLS_PATH ?? path.join(bin, "bmad", "skills")
  const uv = process.env.WISCODE_BUNDLED_UV_PATH ?? path.join(bin, process.platform === "win32" ? "uv.exe" : "uv")
  const manifest = path.join(path.dirname(source), "SOURCE.json")
  if (!existsSync(source) || !existsSync(uv) || !existsSync(manifest)) {
    return { error: "Bundled BMAD or uv resources are missing from this WisCode installation" }
  }
  return { source, uv, manifest }
}

export function prependBundledUvToPath(env: NodeJS.ProcessEnv = process.env, executable = process.execPath) {
  const uv = env.WISCODE_BUNDLED_UV_PATH ?? path.join(
    path.dirname(executable),
    process.platform === "win32" ? "uv.exe" : "uv",
  )
  if (!existsSync(uv)) return false
  const key = Object.keys(env).find((item) => item.toLowerCase() === "path") ?? "PATH"
  const directory = path.dirname(uv)
  if (env[key]?.split(path.delimiter)[0] !== directory) {
    env[key] = [directory, env[key]].filter(Boolean).join(path.delimiter)
  }
  env.WISCODE_BUNDLED_UV_PATH = uv
  return true
}
