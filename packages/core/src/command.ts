export * as CommandV2 from "./command"

import { makeLocationNode } from "./effect/app-node"
import { Context, Effect, Layer, Types } from "effect"
import { Command } from "@opencode-ai/schema/command"
import { State } from "./state"
import { SkillV2 } from "./skill"
import path from "path"

export const Info = Command.Info
export type Info = Command.Info

export function expand(template: string, input: string) {
  const args = (input.match(/(?:\[Image\s+\d+\]|"[^"]*"|'[^']*'|[^\s"']+)/gi) ?? []).map((arg) =>
    arg.replace(/^["']|["']$/g, ""),
  )
  const placeholders = template.match(/\$(\d+)/g) ?? []
  const last = Math.max(0, ...placeholders.map((item) => Number(item.slice(1))))
  const numbered = template.replaceAll(/\$(\d+)/g, (_, index: string) => {
    const position = Number(index)
    return position === last ? args.slice(position - 1).join(" ") : (args[position - 1] ?? "")
  })
  const result = numbered.replaceAll("$ARGUMENTS", input)
  if (placeholders.length || template.includes("$ARGUMENTS") || !input.trim()) return result.trim()
  return `${result.trim()}\n\n${input}`
}

export type Data = {
  commands: Map<string, Types.DeepMutable<Info>>
}

export type Draft = {
  list: () => readonly Info[]
  get: (name: string) => Info | undefined
  update: (name: string, update: (command: Types.DeepMutable<Info>) => void) => void
  remove: (name: string) => void
}

export interface Interface extends State.Transformable<Draft> {
  readonly get: (name: string) => Effect.Effect<Info | undefined>
  readonly list: () => Effect.Effect<Info[]>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/v2/Command") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const skill = yield* SkillV2.Service
    const state = State.create<Data, Draft>({
      initial: () => ({ commands: new Map() }),
      draft: (draft) => ({
        list: () => Array.from(draft.commands.values()) as Info[],
        get: (name) => draft.commands.get(name),
        update: (name, update) => {
          const current = draft.commands.get(name) ?? ({ name, template: "" } as Types.DeepMutable<Info>)
          if (!draft.commands.has(name)) draft.commands.set(name, current)
          update(current)
          current.name = name
        },
        remove: (name) => {
          draft.commands.delete(name)
        },
      }),
    })

    const derived = Effect.fn("CommandV2.derived")(function* () {
      const found = (yield* skill.list()).filter((item) => item.name === "bmad" || item.name.startsWith("bmad-"))
      const commands = found.map((item) =>
        Command.Info.make({
          name: item.name,
          description: item.description?.replace(/\s+/g, " ").trim(),
          source: "skill",
          template: [
            item.content,
            "",
            `Base directory for this skill: ${path.dirname(item.location)}`,
            "Relative paths in this skill (e.g., scripts/, references/) are relative to this base directory.",
          ].join("\n"),
        }),
      )
      const bmad = commands.find((item) => item.name === "bmad")
      if (bmad && !state.get().commands.has("bmad") && !commands.some((item) => item.name === "bmad-help"))
        commands.push(Command.Info.make({ ...bmad, name: "bmad-help" }))
      return commands
    })

    return Service.of({
      reload: state.reload,
      transform: state.transform,
      get: Effect.fn("CommandV2.get")(function* (name) {
        return state.get().commands.get(name) ?? (yield* derived()).find((item) => item.name === name)
      }),
      list: Effect.fn("CommandV2.list")(function* () {
        const registered = state.get().commands
        return [...registered.values(), ...(yield* derived()).filter((item) => !registered.has(item.name))]
      }),
    })
  }),
)

export const locationLayer = layer

export const node = makeLocationNode({ service: Service, layer, deps: [SkillV2.node] })
