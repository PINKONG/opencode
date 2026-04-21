export * as ConfigPaths from "./paths"

import path from "path"
import { Filesystem } from "@/util"
import { Flag } from "@/flag/flag"
import { Global } from "@/global"
import { unique } from "remeda"
import { JsonError } from "./error"

const dirs = [".wiscode", ".opencode"] as const

function readNames(name: string) {
  if (name !== "opencode") return [name]
  return ["wiscode", "opencode"]
}

function writeNames(name: string) {
  if (name !== "opencode") return [name]
  return ["wiscode", "opencode"]
}

export async function projectFiles(name: string, directory: string, worktree?: string) {
  return Filesystem.findUp(
    readNames(name).flatMap((item) => [`${item}.jsonc`, `${item}.json`]),
    directory,
    worktree,
    { rootFirst: true },
  )
}

export async function directories(directory: string, worktree?: string) {
  return unique([
    Global.Path.config,
    ...(!Flag.OPENCODE_DISABLE_PROJECT_CONFIG
      ? await Array.fromAsync(
          Filesystem.up({
            targets: [...dirs].toReversed(),
            start: directory,
            stop: worktree,
          }),
        )
      : []),
    ...(await Array.fromAsync(
      Filesystem.up({
        targets: [...dirs].toReversed(),
        start: Global.Path.home,
        stop: Global.Path.home,
      }),
    )),
    ...(Flag.OPENCODE_CONFIG_DIR ? [Flag.OPENCODE_CONFIG_DIR] : []),
  ])
}

export function fileInDirectory(dir: string, name: string) {
  return readNames(name).flatMap((item) => [path.join(dir, `${item}.json`), path.join(dir, `${item}.jsonc`)])
}

export function preferredFileInDirectory(dir: string, name: string) {
  return writeNames(name).flatMap((item) => [path.join(dir, `${item}.jsonc`), path.join(dir, `${item}.json`)])
}

export function isConfigDir(dir: string) {
  if (dir === Flag.OPENCODE_CONFIG_DIR) return true
  return dirs.some((item) => dir.endsWith(item))
}

export function localDir(root: string) {
  return path.join(root, dirs[0])
}

/** Read a config file, returning undefined for missing files and throwing JsonError for other failures. */
export async function readFile(filepath: string) {
  return Filesystem.readText(filepath).catch((err: NodeJS.ErrnoException) => {
    if (err.code === "ENOENT") return
    throw new JsonError({ path: filepath }, { cause: err })
  })
}
