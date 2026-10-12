export * as BMADManifest from "./manifest"

import { createHash } from "node:crypto"
import { readFile, stat } from "node:fs/promises"
import path from "node:path"

export function watch(project: string) {
  const file = path.join(project, ".opencode", "bmad-managed.json")
  let fingerprint: string | null | undefined
  let metadata: string | undefined

  return async (force = false) => {
    const info = await stat(file).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return undefined
      throw error
    })
    if (!info) {
      if (fingerprint && fingerprint !== null) throw new Error(`BMAD management manifest disappeared: ${file}`)
      fingerprint = null
      metadata = undefined
      return false
    }
    const next = `${info.dev}:${info.ino}:${info.mtimeMs}:${info.size}`
    if (!force && next === metadata) return false
    const bytes = await readFile(file)
    const value: unknown = JSON.parse(bytes.toString("utf8"))
    if (!value || typeof value !== "object" || !("phase" in value))
      throw new Error(`Invalid BMAD management manifest: ${file}`)
    if (value.phase !== "ready") return false
    const hash = createHash("sha256").update(bytes).digest("hex")
    const changed = fingerprint !== hash
    fingerprint = hash
    metadata = next
    return changed
  }
}
