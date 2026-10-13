import path from "node:path"
import os from "node:os"
import { createHash } from "node:crypto"
import { constants } from "node:fs"
import { access, lstat, mkdir, mkdtemp, open, readFile, readdir, realpath, rename, rm, rmdir, writeFile } from "node:fs/promises"

type Question = { module: string; key: string; prompt: string; default?: string; scope: string }
type Answers = { outputFolder?: string; toolsmith?: boolean; moduleAnswers?: Record<string, Record<string, string>> }
type Input = {
  project: string
  source: string
  uv: string
  sourceCommit?: string
  updateSource?: string
  interactive?: boolean
  answers?: Answers
  confirm?: string
}
type Result =
  | { status: "ready"; setup: Record<string, unknown>; files: number }
  | { status: "questions"; questions: Array<Question | { key: "outputFolder" | "toolsmith"; default: string }> }
  | { status: "needs-confirmation" | "conflict" | "error"; message: string; paths?: string[]; confirmation?: string }
type Failure = { status: "error"; message: string }
type Manifest = { schema: 1; commit: string; modules: string[]; files: Record<string, string>; phase: "pending" | "ready" }
type File = { relative: string; content: Buffer; hash: string }

export async function initBMAD(input: Input): Promise<Result> {
  const project = await realpath(input.project).catch(() => undefined)
  if (!project) return { status: "error", message: `Project directory not found: ${input.project}` }
  if (!(await accessible(input.uv))) return { status: "error", message: `Bundled uv unavailable: ${input.uv}` }
  if (!(await accessible(path.join(input.source, "bmad", "scripts", "setup.py")))) {
    return { status: "error", message: `Bundled BMAD unavailable: ${input.source}` }
  }
  const modules = ["bmod-core-tools", "bmod-method", ...(input.answers?.toolsmith ? ["bmod-toolsmith"] : [])]
  const questions = await configQuestions(input, project, modules)
  if (!Array.isArray(questions)) return questions
  if (input.interactive && !input.answers) {
    return {
      status: "questions",
      questions: [
        { key: "outputFolder", default: "_bmad-output" },
        { key: "toolsmith", default: "false" },
        ...questions,
      ],
    }
  }
  if (questions.some((item) => answer(input, item) === undefined)) {
    return { status: "needs-confirmation", message: "BMAD has configuration questions without accepted answers" }
  }
  if (input.answers?.outputFolder && !validOutput(input.answers.outputFolder)) {
    return { status: "error", message: "Output folder must be a relative path within the project" }
  }

  const root = path.join(project, ".agents", "skills")
  const manifestPath = path.join(project, ".wiscode", "bmad-managed.json")
  const legacyPath = path.join(project, ".opencode", "bmad-managed.json")
  const managementDir = await lstat(path.dirname(manifestPath)).catch(() => undefined)
  if (managementDir && !managementDir.isDirectory()) {
    return { status: "conflict", message: `BMAD management directory is not a plain directory: ${path.dirname(manifestPath)}` }
  }
  const managementFile = await lstat(manifestPath).catch(() => undefined)
  if (managementFile && !managementFile.isFile()) {
    return { status: "conflict", message: `BMAD management manifest is not a plain file: ${manifestPath}` }
  }
  const legacyFile = await lstat(legacyPath).catch(() => undefined)
  if (legacyFile && !(await lstat(path.dirname(legacyPath))).isDirectory()) {
    return { status: "conflict", message: `Legacy BMAD management directory is not a plain directory: ${path.dirname(legacyPath)}` }
  }
  if (legacyFile && !legacyFile.isFile()) {
    return { status: "conflict", message: `Legacy BMAD management manifest is not a plain file: ${legacyPath}` }
  }
  if (managementFile && legacyFile) {
    return { status: "conflict", message: "Both WisCode and legacy BMAD management manifests exist", paths: [manifestPath, legacyPath] }
  }
  const currentPath = legacyFile ? legacyPath : manifestPath
  const manifest = await readManifest(currentPath)
  if (manifest === "invalid") return { status: "conflict", message: `Invalid BMAD management manifest: ${currentPath}` }
  const files = await selectedFiles(input.source, input.updateSource ?? input.source, modules)
  if (!Array.isArray(files)) return files
  const conflict = await validateTargets(root, files, manifest)
  if (conflict.length) return { status: "conflict", message: "BMAD files are not managed or were edited", paths: conflict }
  const retired = Object.keys(manifest?.files ?? {}).filter((item) => !files.some((file) => file.relative === item))
  if (manifest && retired.length) {
    const conflicts = await validateTargets(root, retired.map((relative) => ({
      relative, content: Buffer.alloc(0), hash: manifest.files[relative],
    })), manifest)
    if (conflicts.length) return { status: "conflict", message: "Retired BMAD files were edited or removed", paths: conflicts }
  }
  if (manifest) {
    const reports = await Promise.all(modules.map((module) => runSetup(input.uv, project,
      path.join(input.source, "bmad"), input.source, ["--module", module, "--status"])))
    const failed = reports.find((report) => !report.ok)
    if (failed && !failed.ok) return { status: "error", message: failed.message }
    const migrations = reports.flatMap((response) => {
      if (!response.ok || !response.value || typeof response.value !== "object") return []
      const report = response.value as { custom_renames?: { from: string; to: string }[] }
      return report.custom_renames ?? []
    })
    const retiredSkills = reports.flatMap((response) => {
      if (!response.ok || !response.value || typeof response.value !== "object") return []
      const report = response.value as { retired_skills?: { paths: string[] }[] }
      return report.retired_skills ?? []
    })
    if (retiredSkills.some((item) => item.paths.some((item) => {
      if (!item.startsWith(".agents/skills/")) return true
      const name = item.slice(".agents/skills/".length)
      return !retired.some((file) => file.startsWith(`${name}${path.sep}`))
    }))) {
      return { status: "needs-confirmation", message: "Retired BMAD skills outside WisCode management require manual review",
        paths: retiredSkills.flatMap((item) => item.paths) }
    }
    if (migrations.length || retiredSkills.length || retired.length) {
      const confirmationPaths = [...retired, ...migrations.map((item) => `${item.from} -> ${item.to}`),
        ...retiredSkills.flatMap((item) => item.paths)]
      const snapshots = await Promise.all(migrations.map(async (item) => ({
        from: item.from,
        to: item.to,
        content: createHash("sha256").update(await readFile(path.join(project, item.from))).digest("hex"),
      })))
      const confirmation = createHash("sha256").update(JSON.stringify({
        commit: input.sourceCommit,
        previous: manifest.commit,
        files: files.map((file) => [file.relative, file.hash]),
        retired,
        migrations: snapshots,
        retiredSkills,
      })).digest("hex")
      if (input.confirm !== confirmation) {
        return { status: "needs-confirmation", message: "BMAD setup requires migration or retirement confirmation",
          paths: confirmationPaths, confirmation }
      }
    }
  }

  const storagePath = legacyFile ? legacyPath : manifestPath
  await mkdir(path.dirname(storagePath), { recursive: true })
  const lockPath = path.join(path.dirname(storagePath), "bmad.lock")
  const lock = await open(lockPath, "wx").catch(() => undefined)
  if (!lock) return { status: "conflict", message: `BMAD initialization already running: ${lockPath}` }
  try {
    const next: Manifest = {
      schema: 1,
      commit: input.sourceCommit ?? "unknown",
      modules,
      files: Object.fromEntries(files.map((file) => [file.relative, file.hash])),
      phase: "pending",
    }
    for (const file of files) {
      const target = path.join(root, file.relative)
      await mkdir(path.dirname(target), { recursive: true })
      await writeFile(target, file.content)
    }
    for (const relative of retired) await rm(path.join(root, relative))
    for (const directory of [...new Set(retired.map((relative) => path.dirname(relative)))].sort((a, b) => b.length - a.length)) {
      await rmdir(path.join(root, directory)).catch((error: NodeJS.ErrnoException) => {
        if (error.code !== "ENOTEMPTY" && error.code !== "ENOENT") throw error
      })
    }
    await saveManifest(storagePath, next)
    if (input.answers?.outputFolder && !(await accessible(path.join(project, "_bmad", "config.toml")))) {
      await mkdir(path.join(project, "_bmad"), { recursive: true })
      await writeFile(path.join(project, "_bmad", "config.toml"), `[core]\noutput_folder = ${JSON.stringify(input.answers.outputFolder)}\n`)
    }
    const temp = await mkdtemp(path.join(os.tmpdir(), "wiscode-bmad-answers-"))
    try {
      const answers = questions.map((item) => ({ ...item, value: answer(input, item) }))
      const answerFile = path.join(temp, "answers.toml")
      if (answers.length) {
        await writeFile(answerFile, Object.entries(Object.groupBy(answers, (item) => item.module))
          .map(([module, entries]) => [`[modules.${JSON.stringify(module)}]`, ...entries!.map((item) => `${JSON.stringify(item.key)} = ${JSON.stringify(item.value)}`)].join("\n"))
          .join("\n\n") + "\n")
      }
      const response = await runSetup(input.uv, project, path.join(root, "bmad"), root,
        answers.length ? ["--module-answers", answerFile] : [])
      if (!response.ok) return { status: "error", message: response.message }
      await saveManifest(storagePath, { ...next, phase: "ready" })
      if (legacyFile) await rename(legacyPath, manifestPath)
      return { status: "ready", setup: response.value as Record<string, unknown>, files: files.length }
    } finally {
      await rm(temp, { recursive: true, force: true })
    }
  } catch (error) {
    return { status: "error", message: error instanceof Error ? error.message : String(error) }
  } finally {
    await lock.close()
    await rm(lockPath, { force: true })
  }
}

async function accessible(file: string) {
  return access(file, constants.F_OK).then(() => true, () => false)
}

function validOutput(value: string) {
  return !!value && !path.posix.isAbsolute(value) && !path.win32.isAbsolute(value) &&
    value.split(/[\\/]/).every((part) => !!part && part !== "." && part !== ".." && !part.includes(":") && !part.includes("\0"))
}

function answer(input: Input, question: Question) {
  return input.interactive
    ? (input.answers?.moduleAnswers?.[question.module]?.[question.key] ?? question.default)
    : question.default
}

async function configQuestions(input: Input, project: string, modules: string[]): Promise<Question[] | Failure> {
  const questions: Question[] = []
  for (const module of modules) {
    const response = await runSetup(input.uv, project, path.join(input.source, "bmad"), input.source,
      ["--module", module, "--list-config-questions"])
    if (!response.ok) return { status: "error" as const, message: response.message }
    if (!Array.isArray(response.value)) return { status: "error" as const, message: "Invalid BMAD questions response" }
    questions.push(...(response.value as Question[]))
  }
  return questions
}

async function selectedFiles(source: string, updateSource: string, modules: string[]): Promise<File[] | Failure> {
  const names = new Set(["bmad", ...modules])
  for (const module of modules) {
    const text = await Bun.file(path.join(source, module, "bmod.toml")).text().catch(() => undefined)
    if (!text) return { status: "error", message: `Missing BMAD module: ${module}` }
    const record = Bun.TOML.parse(text) as { bmod?: { skills?: string[] } }
    if (!Array.isArray(record.bmod?.skills)) return { status: "error", message: `Invalid BMAD module: ${module}` }
    for (const name of record.bmod.skills) names.add(name)
  }
  const files: File[] = []
  for (const name of names) {
    if (!/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(name)) return { status: "error", message: `Invalid BMAD skill: ${name}` }
    const collect = async (dir: string, relative: string): Promise<boolean> => {
      const entries = await readdir(dir, { withFileTypes: true }).catch(() => undefined)
      if (!entries) return false
      for (const entry of entries) {
        if (entry.isSymbolicLink()) return false
        const next = path.join(relative, entry.name)
        if (entry.isDirectory()) {
          if (!(await collect(path.join(dir, entry.name), next))) return false
          continue
        }
        if (!entry.isFile()) return false
        const content = await readFile(path.join(dir, entry.name))
        const value = entry.name === "bmod.toml" && name.startsWith("bmod-")
          ? Buffer.from(content.toString("utf8").replace(/^update_source = .*$/m,
              `update_source = ${JSON.stringify(`file:${updateSource}`)}`))
          : content
        files.push({ relative: next, content: value, hash: createHash("sha256").update(value).digest("hex") })
      }
      return true
    }
    if (!(await collect(path.join(source, name), name))) return { status: "error", message: `Invalid BMAD skill directory: ${name}` }
  }
  return files
}

async function validateTargets(root: string, files: File[], manifest: Manifest | undefined) {
  const conflicts: string[] = []
  for (const directory of [path.dirname(root), root]) {
    if ((await lstat(directory).catch(() => undefined))?.isSymbolicLink()) conflicts.push(directory)
  }
  const names = new Set(files.map((file) => file.relative.split(path.sep)[0]))
  for (const name of names) {
    const stat = await lstat(path.join(root, name)).catch(() => undefined)
    if (stat && (!stat.isDirectory() || !Object.keys(manifest?.files ?? {}).some((file) => file.startsWith(`${name}${path.sep}`)))) {
      conflicts.push(name)
    }
  }
  for (const file of files) {
    const target = path.join(root, file.relative)
    const parts = file.relative.split(path.sep)
    for (let index = 2; index < parts.length; index++) {
      const directory = path.join(root, ...parts.slice(0, index))
      const stat = await lstat(directory).catch(() => undefined)
      if (stat && !stat.isDirectory()) conflicts.push(path.join(...parts.slice(0, index)))
    }
    const stat = await lstat(target).catch(() => undefined)
    if (!stat) {
      if (manifest?.files[file.relative]) conflicts.push(file.relative)
      continue
    }
    if (!stat.isFile()) {
      conflicts.push(file.relative)
      continue
    }
    const previous = manifest?.files[file.relative]
    if (!previous || createHash("sha256").update(await readFile(target)).digest("hex") !== previous) conflicts.push(file.relative)
  }
  return [...new Set(conflicts)]
}

async function readManifest(file: string): Promise<Manifest | "invalid" | undefined> {
  const text = await Bun.file(file).text().catch(() => undefined)
  if (!text) return
  try {
    const value: unknown = JSON.parse(text)
    if (!value || typeof value !== "object" || !("schema" in value) || value.schema !== 1) return "invalid"
    if (!("commit" in value) || typeof value.commit !== "string") return "invalid"
    if (!("phase" in value) || (value.phase !== "pending" && value.phase !== "ready")) return "invalid"
    if (!("modules" in value) || !Array.isArray(value.modules) ||
      !value.modules.every((module) => typeof module === "string" && /^bmod-[a-z0-9-]+$/.test(module))) return "invalid"
    if (!("files" in value) || !value.files || typeof value.files !== "object" || Array.isArray(value.files)) return "invalid"
    if (!Object.entries(value.files).every(([name, hash]) => {
      const parts = name.split(/[\\/]/)
      return parts.length > 1 && /^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(parts[0]) &&
        parts.every((part) => !!part && part !== "." && part !== ".." && !part.includes(":") && !part.includes("\0")) &&
        typeof hash === "string" && /^[a-f0-9]{64}$/.test(hash)
    })) return "invalid"
    return value as Manifest
  } catch {
    return "invalid"
  }
}

async function saveManifest(file: string, value: Manifest) {
  const temp = `${file}.${process.pid}.tmp`
  await writeFile(temp, JSON.stringify(value, null, 2) + "\n")
  await rename(temp, file)
}

async function runSetup(uv: string, project: string, skill: string, root: string, options: string[]): Promise<{ ok: true; value: unknown } | { ok: false; message: string }> {
  const child = Bun.spawn([uv, "run", "--no-cache", path.join(skill, "scripts", "setup.py"), "--project-root", project,
    "--skill", skill, "--root", root, ...options], {
    cwd: project,
    stdout: "pipe",
    stderr: "pipe",
    env: { ...process.env, PATH: `${path.dirname(uv)}${path.delimiter}${process.env.PATH ?? ""}` },
  })
  const [stdout, stderr, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ])
  if (code !== 0) return { ok: false, message: stderr.trim() || `BMAD setup exited ${code}` }
  try {
    return { ok: true, value: JSON.parse(stdout) as unknown }
  } catch {
    return { ok: false, message: `Invalid BMAD setup output: ${stdout}` }
  }
}
