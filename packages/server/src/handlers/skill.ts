import { SkillV2 } from "@opencode-ai/core/skill"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { Location } from "@opencode-ai/core/location"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const SkillHandler = HttpApiBuilder.group(Api, "server.skill", (handlers) =>
  handlers.handle("skill.list", () =>
    response(
      Effect.gen(function* () {
        const location = yield* Location.Service
        const plugin = yield* PluginV2.Service
        yield* plugin.wait(PluginV2.ID.make("config-skill"))
        const skill = yield* SkillV2.Service
        yield* skill.refreshBMAD(Location.projectDirectory(location.directory, location.project.directory), true)
        return yield* skill.list()
      }),
    ),
  ),
)
