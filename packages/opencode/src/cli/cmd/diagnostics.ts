import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { DiagnosticReader } from "@opencode-ai/core/diagnostic-reader"
import { Config } from "@/config/config"
import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"
import { renderDiagnosticEvent, renderDiagnosticRow } from "./diagnostic-format"
import { watch } from "node:fs"
import path from "node:path"

const TailCommand = effectCmd({
  command: "tail",
  describe: "read a chronological view of local diagnostic logs",
  instance: false,
  builder: (yargs) => yargs
    .option("session", { type: "string", describe: "show one session" })
    .option("trace", { type: "string", describe: "show a trace and its child traces" })
    .option("since", { type: "string", describe: "include events at or after this RFC3339 time" })
    .option("until", { type: "string", describe: "include events at or before this RFC3339 time" })
    .option("limit", { type: "number", default: 100, describe: "initial row limit" })
    .option("event", { type: "string", describe: "event name glob, with * as wildcard" })
    .option("status", { type: "string", choices: ["started", "succeeded", "failed", "cancelled", "dropped"] as const })
    .option("follow", { type: "boolean", default: false })
    .option("chunks", { type: "boolean", default: false })
    .option("ids", { type: "boolean", default: false })
    .option("utc", { type: "boolean", default: false })
    .conflicts("session", "trace")
    .conflicts("follow", "until"),
  handler: Effect.fn("Cli.diagnostics.tail")(function* (args) {
    if (args.session && !/^ses_[A-Za-z0-9_-]+$/.test(args.session)) return yield* fail("invalid session ID")
    if (args.trace && !/^trace_[A-Za-z0-9_-]+$/.test(args.trace)) return yield* fail("invalid trace ID")
    if (args.event && !/^[A-Za-z0-9_.\-*]+$/.test(args.event)) return yield* fail("invalid event glob")
    if (!Number.isSafeInteger(args.limit) || args.limit < 1 || args.limit > 10_000) return yield* fail("limit must be 1..10000")
    const since = args.since ? parseTimestamp(args.since) : undefined
    const until = args.until ? parseTimestamp(args.until) : undefined
    if (args.since && since === undefined) return yield* fail("invalid --since timestamp")
    if (args.until && until === undefined) return yield* fail("invalid --until timestamp")
    if (since !== undefined && until !== undefined && since > until) return yield* fail("--since is after --until")
    const diagnostics = yield* DiagnosticTrace.Service
    let lastProgress = 0
    const scope = {
      session: args.session, trace: args.trace, since: since === undefined ? undefined : new Date(since).toISOString(),
      until: until === undefined ? undefined : new Date(until).toISOString(), limit: args.limit,
      event: args.event, status: args.status, chunks: args.chunks,
      onProgress: (files: number, bytes: number) => {
        if (!process.stderr.isTTY || Date.now() - lastProgress < 100) return
        lastProgress = Date.now()
        process.stderr.write(`\rScanning ${files} files / ${(bytes / 1024 / 1024).toFixed(1)} MiB...`)
      },
    }
    const result = yield* Effect.promise(() => DiagnosticReader.snapshot(diagnostics.root(), scope))
    if (lastProgress) process.stderr.write("\n")
    if (!result.exists) return yield* fail(`diagnostic ${args.session ? "session" : "trace"} not found`)
    for (const warning of result.warnings) console.error(warning)
    if (result.rows.length === 0) console.log("No diagnostic events match the filters.")
    for (const row of result.rows) console.log(renderDiagnosticRow(row, args))
    if (args.follow) yield* Effect.promise(() => followLogs(diagnostics.root(), scope, result, args))
  }),
})

async function followLogs(root: string, scope: DiagnosticReader.Scope, initial: DiagnosticReader.Result, options: { ids: boolean; utc: boolean }) {
  let cursors = initial.cursors
  const traces = initial.traceIds
  let stopped = false
  const interrupt = () => { stopped = true }
  process.once("SIGINT", interrupt)
  try {
    while (!stopped) {
      const pending = new Set<string>()
      const known = new Set(traces)
      const link = (row: DiagnosticReader.Row) => {
        const child = row.parentTraceId && traces.has(row.parentTraceId) ? row.traceId : undefined
        const named = row.event === "task.child.started" && row.traceId && traces.has(row.traceId)
          ? row.summary.childTraceId : undefined
        for (const candidate of [child, named]) {
          if (typeof candidate !== "string" || traces.has(candidate)) continue
          traces.add(candidate)
          pending.add(candidate)
        }
      }
      const emit = (row: DiagnosticReader.Row, backfilled = false) => {
        if (scope.trace && !backfilled && (!row.traceId || !known.has(row.traceId))) return
        if (!DiagnosticReader.matches(row, scope, traces)) return
        console.log(renderDiagnosticRow(row, options))
      }
      const result = await DiagnosticReader.poll(root, cursors, (row) => {
        link(row)
        emit(row)
      })
      cursors = result.cursors
      for (const file of result.resets) console.error(`Diagnostic stream reset: ${file}`)
      while (pending.size) {
        const added = new Set(pending)
        pending.clear()
        await DiagnosticReader.backfill(root, added, (row) => {
          link(row)
          emit(row, true)
        })
      }
      if (stopped) break
      await new Promise<void>((resolve) => {
        const watchers: ReturnType<typeof watch>[] = []
        const finish = () => {
          clearTimeout(timer)
          for (const watcher of watchers) watcher.close()
          process.removeListener("SIGINT", finish)
          resolve()
        }
        const timer = setTimeout(finish, 1000)
        process.once("SIGINT", finish)
        for (const directory of [root, path.join(root, new Date().toISOString().slice(0, 10))]) {
          try {
            const watcher = watch(directory, finish)
            watcher.on("error", finish)
            watchers.push(watcher)
          } catch (error) {
            if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error
          }
        }
      })
    }
  } finally {
    process.removeListener("SIGINT", interrupt)
  }
}

function parseTimestamp(value: string) {
  const match = value.match(/^(\d{4})-(\d{2})-(\d{2})T(\d{2}):(\d{2}):(\d{2})(?:\.\d{1,9})?(Z|[+-]\d{2}:\d{2})$/)
  if (!match) return undefined
  const year = Number(match[1])
  const month = Number(match[2])
  const day = Number(match[3])
  if (year < 100 || month < 1 || month > 12 || day < 1 || day > 31) return undefined
  if (new Date(Date.UTC(year, month - 1, day)).toISOString().slice(0, 10) !== `${match[1]}-${match[2]}-${match[3]}`) return undefined
  if (Number(match[4]) > 23 || Number(match[5]) > 59 || Number(match[6]) > 59) return undefined
  if (match[7] !== "Z" && (Number(match[7].slice(1, 3)) > 23 || Number(match[7].slice(4)) > 59)) return undefined
  const timestamp = Date.parse(value)
  return Number.isFinite(timestamp) ? timestamp : undefined
}

const ShowCommand = effectCmd({
  command: "show <eventId>",
  describe: "inspect one diagnostic event",
  instance: false,
  builder: (yargs) => yargs.positional("eventId", { type: "string", demandOption: true }).option("raw", { type: "boolean", default: false, describe: "print unredacted provider payloads, which may contain secrets" }).option("utc", { type: "boolean", default: false }),
  handler: Effect.fn("Cli.diagnostics.show")(function* (args) {
    if (!/^evt_[A-Za-z0-9_-]+$/.test(args.eventId)) return yield* fail("invalid event ID")
    const diagnostics = yield* DiagnosticTrace.Service
    const found = yield* Effect.promise(() => DiagnosticReader.find(diagnostics.root(), args.eventId))
    if (!found) return yield* fail(`diagnostic event not found: ${args.eventId}`)
    if (args.raw) console.error("Showing unredacted diagnostic payload; it may contain secrets.")
    console.log(renderDiagnosticEvent(found.event, args.raw))
  }),
})

const StatusCommand = effectCmd({
  command: "status",
  describe: "show diagnostic capture settings and the local log directory",
  instance: false,
  handler: Effect.fn("Cli.diagnostics.status")(function* () {
    const config = yield* Config.Service
    const diagnostics = yield* DiagnosticTrace.Service
    const info = yield* config.getGlobal()
    yield* diagnostics.configure({
      enabled: info.diagnostics?.enabled ?? false,
      rawPayloads: info.diagnostics?.rawPayloads ?? false,
      streaming: info.diagnostics?.streaming ?? false,
      retentionDays: info.diagnostics?.retentionDays ?? 14,
      maxTotalBytes: info.diagnostics?.maxTotalBytes ?? 2 * 1024 * 1024 * 1024,
    })
    console.log(JSON.stringify({ root: diagnostics.root(), ...diagnostics.config() }))
  }),
})

const CleanupCommand = effectCmd({
  command: "cleanup",
  describe: "apply diagnostic retention limits to local logs",
  instance: false,
  builder: (yargs) => yargs.option("yes", { type: "boolean", default: false, describe: "confirm local log deletion" }),
  handler: Effect.fn("Cli.diagnostics.cleanup")(function* (args) {
    if (!args.yes) return yield* fail("diagnostics cleanup requires --yes because it deletes old logs")
    const config = yield* Config.Service
    const diagnostics = yield* DiagnosticTrace.Service
    const info = yield* config.getGlobal()
    yield* diagnostics.configure({
      enabled: info.diagnostics?.enabled ?? false,
      rawPayloads: info.diagnostics?.rawPayloads ?? false,
      streaming: info.diagnostics?.streaming ?? false,
      retentionDays: info.diagnostics?.retentionDays ?? 14,
      maxTotalBytes: info.diagnostics?.maxTotalBytes ?? 2 * 1024 * 1024 * 1024,
    })
    yield* diagnostics.cleanup()
    console.log(diagnostics.root())
  }),
})

const ClearCommand = effectCmd({
  command: "clear",
  describe: "delete all local diagnostic logs, including today's files",
  instance: false,
  builder: (yargs) => yargs.option("yes", { type: "boolean", default: false, describe: "confirm all log deletion" }),
  handler: Effect.fn("Cli.diagnostics.clear")(function* (args) {
    if (!args.yes) return yield* fail("diagnostics clear requires --yes because it deletes all logs")
    const diagnostics = yield* DiagnosticTrace.Service
    const result = yield* diagnostics.clear()
    console.log(JSON.stringify({ root: diagnostics.root(), ...result }))
  }),
})

export const DiagnosticsCommand = effectCmd({
  command: "diagnostics",
  describe: "inspect and manage local diagnostic logs",
  instance: false,
  builder: (yargs) => yargs.command(StatusCommand).command(CleanupCommand).command(ClearCommand).command(TailCommand).command(ShowCommand).demandCommand(),
  handler: Effect.fn("Cli.diagnostics")(function* () {}),
})
