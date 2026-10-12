import { expect } from "bun:test"
import { Effect, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { CrossSpawnSpawner } from "@opencode-ai/core/cross-spawn-spawner"
import { Command } from "../../src/command"
import { Skill } from "../../src/skill"
import { provideTmpdirInstance, testInstanceStoreLayer } from "../fixture/fixture"
import { testEffect } from "../lib/effect"
import path from "path"

const it = testEffect(
  Layer.mergeAll(
    LayerNode.compile(Command.node),
    LayerNode.compile(Skill.node),
    LayerNode.compile(CrossSpawnSpawner.node),
    testInstanceStoreLayer,
  ),
)

it.live("rebuilds project skills and commands in the same layer", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const skill = yield* Skill.Service
        const command = yield* Command.Service
        expect((yield* command.list()).some((item) => item.name === "bmad")).toBe(false)
        yield* Effect.promise(() =>
          Bun.write(
            path.join(dir, ".agents", "skills", "bmad", "SKILL.md"),
            "---\nname: bmad\ndescription: BMAD help.\n---\n\n# BMAD\n",
          ),
        )
        yield* skill.reload()
        yield* command.reload()
        expect((yield* command.get("bmad"))?.source).toBe("skill")
        expect((yield* command.get("bmad-help"))?.template).toBe((yield* command.get("bmad"))?.template)
      }),
    { git: true },
  ),
)

it.live("refreshes command and skill caches after a ready BMAD manifest appears", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const command = yield* Command.Service
        expect((yield* command.list()).some((item) => item.name === "bmad")).toBe(false)
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(dir, ".agents", "skills", "bmad", "SKILL.md"),
            "---\nname: bmad\ndescription: BMAD help.\n---\n\n# BMAD\n",
          )
          await Bun.write(path.join(dir, ".opencode", "bmad-managed.json"), '{"phase":"ready","commit":"one"}')
        })
        expect((yield* command.list()).find((item) => item.name === "bmad")?.source).toBe("skill")
      }),
    { git: true },
  ),
)

it.live("refreshes direct skill discovery after a ready BMAD manifest appears", () =>
  provideTmpdirInstance(
    (dir) =>
      Effect.gen(function* () {
        const skill = yield* Skill.Service
        expect((yield* skill.all()).some((item) => item.name === "bmad")).toBe(false)
        yield* Effect.promise(async () => {
          await Bun.write(
            path.join(dir, ".agents", "skills", "bmad", "SKILL.md"),
            "---\nname: bmad\ndescription: BMAD help.\n---\n\n# BMAD\n",
          )
          await Bun.write(path.join(dir, ".opencode", "bmad-managed.json"), '{"phase":"ready","commit":"one"}')
        })
        expect((yield* skill.all()).some((item) => item.name === "bmad")).toBe(true)
      }),
    { git: true },
  ),
)
