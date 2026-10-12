import path from "node:path"
import { randomUUID } from "node:crypto"
import { cp, mkdir, open, readdir, rename, rm } from "node:fs/promises"
import { existsSync } from "node:fs"
import semver from "semver"

export async function prepareBMADSource(input: {
  vendor: string
  cache: string
  commit: string
  wiscodeVersion: string
}): Promise<string> {
  const current = path.join(input.cache, "current")
  const skills = path.join(current, "skills")
  await mkdir(input.cache, { recursive: true })
  const lockPath = path.join(input.cache, ".lock")
  const lock = await open(lockPath, "wx").catch(() => undefined)
  if (!lock) throw new Error(`BMAD source cache is busy: ${input.cache}`)
  try {
    const installed = await Bun.file(path.join(current, "WISCODE.json"))
      .json()
      .catch(() => undefined) as { commit?: string; wiscodeVersion?: string; sourceFormat?: number } | undefined
    if (installed?.commit === input.commit && installed.sourceFormat === 1 &&
      existsSync(path.join(skills, "bmad", "SKILL.md"))) return skills
    if (installed?.wiscodeVersion && semver.gt(installed.wiscodeVersion, input.wiscodeVersion)) {
      throw new Error(`BMAD source cache belongs to a newer WisCode (${installed.wiscodeVersion})`)
    }
    const stage = path.join(input.cache, `.stage-${randomUUID()}`)
    const previous = path.join(input.cache, `.previous-${randomUUID()}`)
    try {
      await cp(input.vendor, stage, { recursive: true })
      for (const entry of await readdir(path.join(stage, "skills"), { withFileTypes: true })) {
        if (!entry.isDirectory() || !entry.name.startsWith("bmod-")) continue
        const file = path.join(stage, "skills", entry.name, "bmod.toml")
        const content = await Bun.file(file).text()
        if (!/^update_source = .*$/m.test(content)) throw new Error(`Invalid BMAD module record: ${file}`)
        await Bun.write(file, content.replace(/^update_source = .*$/m,
          `update_source = ${JSON.stringify(`file:${skills}`)}`))
      }
      await Bun.write(path.join(stage, "WISCODE.json"), JSON.stringify({
        commit: input.commit,
        wiscodeVersion: input.wiscodeVersion,
        sourceFormat: 1,
      }))
      if (existsSync(current)) await rename(current, previous)
      try {
        await rename(stage, current)
      } catch (error) {
        if (existsSync(previous)) await rename(previous, current)
        throw error
      }
    } finally {
      await rm(stage, { recursive: true, force: true })
      await rm(previous, { recursive: true, force: true })
    }
    return skills
  } finally {
    await lock.close()
    await rm(lockPath, { force: true })
  }
}
