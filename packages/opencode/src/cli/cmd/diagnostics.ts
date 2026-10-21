import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Config } from "@/config/config"
import { Effect } from "effect"
import { effectCmd, fail } from "../effect-cmd"

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

export const DiagnosticsCommand = effectCmd({
  command: "diagnostics",
  describe: "inspect and clean up local diagnostic logs",
  instance: false,
  builder: (yargs) => yargs.command(StatusCommand).command(CleanupCommand).demandCommand(),
  handler: Effect.fn("Cli.diagnostics")(function* () {}),
})
