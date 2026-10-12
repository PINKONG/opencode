#!/usr/bin/env bun

import path from "node:path"
import { randomUUID, createHash } from "node:crypto"
import { cp, mkdir, readdir, readFile, rename, rm, writeFile } from "node:fs/promises"

const root = path.resolve(import.meta.dirname, "..")
const vendor = path.join(root, "third_party", "bmad")
const args = process.argv.slice(2)
const value = (name: string) => args[args.indexOf(name) + 1]
const source = args.includes("--source") ? path.resolve(value("--source")) : undefined
const commit = args.includes("--commit") ? value("--commit") : undefined
if (!source || !commit || !/^[a-f0-9]{40}$/.test(commit)) {
  throw new Error("Usage: bun script/update-bmad.ts --source <BMAD checkout> --commit <40-char SHA> [--check]")
}

async function run(command: string[], cwd: string) {
  const child = Bun.spawn(command, { cwd, stdout: "pipe", stderr: "pipe" })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(), new Response(child.stderr).text(), child.exited,
  ])
  if (code !== 0) throw new Error(`${command[0]} failed: ${stderr || stdout}`)
  return stdout
}

async function contents(directory: string, prefix = ""): Promise<Record<string, string>> {
  const files: Record<string, string> = {}
  for (const entry of (await readdir(directory, { withFileTypes: true })).sort((a, b) => a.name.localeCompare(b.name))) {
    const relative = path.join(prefix, entry.name)
    if (entry.isDirectory()) {
      Object.assign(files, await contents(path.join(directory, entry.name), relative))
      continue
    }
    if (!entry.isFile()) throw new Error(`Unexpected vendor entry: ${relative}`)
    const content = await readFile(path.join(directory, entry.name))
    files[relative] = createHash("sha256")
      .update(relative === "SOURCE.json" ? JSON.stringify(JSON.parse(content.toString("utf8"))) : content)
      .digest("hex")
  }
  return files
}

const stage = path.join(path.dirname(vendor), `.bmad-stage-${randomUUID()}`)
const backup = path.join(path.dirname(vendor), `.bmad-previous-${randomUUID()}`)
let promoted = false
try {
  await mkdir(stage)
  const archive = path.join(stage, "source.tar")
  await run(["git", "-C", source, "archive", "--format=tar", `--output=${archive}`, commit, "LICENSE", "skills"], root)
  await run(["tar", "-xf", archive, "-C", stage], root)
  await rm(archive)
  await mkdir(path.join(stage, "patches"))
  await cp(path.join(vendor, "patches", "local-update.patch"), path.join(stage, "patches", "local-update.patch"))
  await run(["git", "apply", `--directory=${path.relative(root, stage)}`, path.join(stage, "patches", "local-update.patch")], root)
  const module = Bun.TOML.parse(await Bun.file(path.join(stage, "skills/bmod-method/bmod.toml")).text()) as {
    bmod: { version: string }
  }
  await writeFile(path.join(stage, "SOURCE.json"), JSON.stringify({
    repository: "https://github.com/bmad-code-org/BMAD-METHOD",
    branch: "main",
    commit,
    version: module.bmod.version,
    paths: ["LICENSE", "skills"],
    patches: ["patches/local-update.patch"],
  }, null, 2) + "\n")
  if (args.includes("--check")) {
    const expected = await contents(stage)
    const actual = await contents(vendor)
    const changed = [...new Set([...Object.keys(expected), ...Object.keys(actual)])]
      .filter((file) => expected[file] !== actual[file])
    if (changed.length) throw new Error(`BMAD snapshot differs: ${changed.join(", ")}`)
    console.log("BMAD snapshot matches the pinned source and local patch")
  } else {
    await rename(vendor, backup)
    try {
      await rename(stage, vendor)
      promoted = true
    } catch (error) {
      await rename(backup, vendor)
      throw error
    }
    console.log(`Updated BMAD vendor to ${commit}`)
  }
} finally {
  await rm(stage, { recursive: true, force: true })
  if (promoted) await rm(backup, { recursive: true, force: true })
}
