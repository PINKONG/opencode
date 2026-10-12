import { Effect } from "effect"
import { effectCmd } from "../effect-cmd"
import { initBMAD } from "../../bmad/init"
import { bundledBMAD } from "../../bmad/resources"
import { prepareBMADSource } from "../../bmad/source-cache"
import { InstallationVersion } from "@opencode-ai/core/installation/version"
import path from "node:path"
import os from "node:os"

const InitCommand = effectCmd({
  command: "init",
  describe: "initialize or update embedded BMAD in a project",
  instance: false,
  builder: (yargs) => yargs
    .option("project-root", { type: "string", default: process.cwd(), describe: "project directory" })
    .option("interactive", { type: "boolean", default: false, describe: "ask configuration questions" })
    .option("answers", { type: "string", describe: "JSON answer file for interactive initialization" })
    .option("confirm", { type: "string", describe: "confirmation token returned by BMAD preflight" }),
  handler: Effect.fn("Cli.bmad.init")(function* (args) {
    const resources = bundledBMAD()
    if ("error" in resources) {
      console.log(JSON.stringify({ status: "error", message: resources.error }))
      process.exitCode = 1
      return
    }
    const metadata = yield* Effect.promise(() => Bun.file(resources.manifest).json() as Promise<{ commit: string }>)
    const cache = process.env.WISCODE_BMAD_CACHE_PATH ?? path.join(
      process.platform === "win32" ? (process.env.APPDATA ?? os.homedir()) : os.homedir(),
      process.platform === "win32" ? "WisCode" : ".wiscode",
      "bmad",
      "source",
    )
    const source = yield* Effect.promise(() => prepareBMADSource({
      vendor: path.dirname(resources.source),
      cache,
      commit: metadata.commit,
      wiscodeVersion: InstallationVersion,
    }))
    const answers = args.answers
      ? yield* Effect.promise(() => Bun.file(args.answers).json() as Promise<{
          outputFolder?: string
          toolsmith?: boolean
          moduleAnswers?: Record<string, Record<string, string>>
        }>)
      : undefined
    const result = yield* Effect.promise(() => initBMAD({
      project: args.projectRoot,
      source,
      uv: resources.uv,
      sourceCommit: metadata.commit,
      updateSource: source,
      interactive: args.interactive,
      answers,
      confirm: args.confirm,
    }))
    console.log(JSON.stringify(result))
    if (result.status === "error" || result.status === "conflict") process.exitCode = 1
  }),
})

export const BmadCommand = effectCmd({
  command: "bmad",
  describe: "embedded BMAD tools",
  instance: false,
  builder: (yargs) => yargs.command(InitCommand).demandCommand(),
  handler: Effect.fn("Cli.bmad")(function* () {}),
})
