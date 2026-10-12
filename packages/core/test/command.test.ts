import { describe, expect } from "bun:test"
import fs from "fs/promises"
import path from "path"
import { Effect } from "effect"
import { CommandV2 } from "@opencode-ai/core/command"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { ModelV2 } from "@opencode-ai/core/model"
import { ProviderV2 } from "@opencode-ai/core/provider"
import { AbsolutePath } from "@opencode-ai/core/schema"
import { SkillV2 } from "@opencode-ai/core/skill"
import { testEffect } from "./lib/effect"
import { tmpdir } from "./fixture/tmpdir"

const it = testEffect(AppNodeBuilder.build(CommandV2.node))
const itWithSkills = testEffect(AppNodeBuilder.build(LayerNode.group([CommandV2.node, SkillV2.node])))

describe("CommandV2", () => {
  it.effect("expands command arguments without losing trailing input", () =>
    Effect.sync(() => {
      expect(CommandV2.expand("Do $1 then $2", 'first "two words" remaining')).toBe("Do first then two words remaining")
      expect(CommandV2.expand("Review $ARGUMENTS", "a b")).toBe("Review a b")
      expect(CommandV2.expand("# Skill", "a b")).toBe("# Skill\n\na b")
    }),
  )

  itWithSkills.live("derives discovered BMAD skills without overriding commands", () =>
    Effect.acquireRelease(
      Effect.promise(() => tmpdir()),
      (tmp) => Effect.promise(() => tmp[Symbol.asyncDispose]()),
    ).pipe(
      Effect.flatMap((tmp) =>
        Effect.gen(function* () {
          const root = path.join(tmp.path, "skills")
          yield* Effect.promise(() => fs.mkdir(root, { recursive: true }))
          const skill = yield* SkillV2.Service
          const command = yield* CommandV2.Service
          yield* skill.transform((draft) => draft.source({ type: "directory", path: AbsolutePath.make(root) }))
          expect(yield* command.get("bmad-agent-pm")).toBeUndefined()
          yield* Effect.promise(async () => {
            await fs.mkdir(path.join(root, "bmad-agent-pm"))
            await fs.writeFile(
              path.join(root, "bmad-agent-pm", "SKILL.md"),
              "---\nname: bmad-agent-pm\ndescription: PM help\n---\n# PM",
            )
            await fs.mkdir(path.join(root, "bmad"))
            await fs.writeFile(
              path.join(root, "bmad", "SKILL.md"),
              "---\nname: bmad\ndescription: BMAD help\n---\n# Help",
            )
          })
          yield* skill.reload()
          expect((yield* command.get("bmad-agent-pm"))?.template).toContain("# PM")
          expect((yield* command.get("bmad-help"))?.template).toBe((yield* command.get("bmad"))?.template)
          yield* command.transform((draft) => draft.update("bmad", (item) => (item.template = "custom bmad")))
          expect(yield* command.get("bmad-help")).toBeUndefined()
          yield* command.transform((draft) => draft.update("bmad-agent-pm", (item) => (item.template = "custom")))
          expect((yield* command.get("bmad-agent-pm"))?.template).toBe("custom")
          expect((yield* command.list()).filter((item) => item.name === "bmad-agent-pm")).toHaveLength(1)
        }),
      ),
    ),
  )

  it.effect("applies command transforms and preserves later overrides", () =>
    Effect.gen(function* () {
      const command = yield* CommandV2.Service
      yield* command.transform((editor) => {
        editor.update("review", (command) => {
          command.template = "First"
          command.description = "Review code"
        })
        editor.update("review", (command) => {
          command.template = "Second"
          command.model = {
            id: ModelV2.ID.make("claude"),
            providerID: ProviderV2.ID.make("anthropic"),
            variant: ModelV2.VariantID.make("high"),
          }
        })
      })

      expect(yield* command.get("review")).toEqual(
        CommandV2.Info.make({
          name: "review",
          template: "Second",
          description: "Review code",
          model: {
            id: ModelV2.ID.make("claude"),
            providerID: ProviderV2.ID.make("anthropic"),
            variant: ModelV2.VariantID.make("high"),
          },
        }),
      )
      expect(yield* command.list()).toEqual([
        CommandV2.Info.make({
          name: "review",
          template: "Second",
          description: "Review code",
          model: {
            id: ModelV2.ID.make("claude"),
            providerID: ProviderV2.ID.make("anthropic"),
            variant: ModelV2.VariantID.make("high"),
          },
        }),
      ])
    }),
  )
})
