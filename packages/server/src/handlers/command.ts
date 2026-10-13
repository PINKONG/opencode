import { CommandV2 } from "@opencode-ai/core/command"
import { SkillV2 } from "@opencode-ai/core/skill"
import { PluginV2 } from "@opencode-ai/core/plugin"
import { Location } from "@opencode-ai/core/location"
import { Effect } from "effect"
import { HttpApiBuilder } from "effect/unstable/httpapi"
import { Api } from "../api"
import { response } from "../location"

export const CommandHandler = HttpApiBuilder.group(Api, "server.command", (handlers) =>
  handlers.handle("command.list", () =>
    response(
      Effect.gen(function* () {
        const location = yield* Location.Service
        const plugin = yield* PluginV2.Service
        yield* plugin.wait(PluginV2.ID.make("config-skill"))
        yield* plugin.wait(PluginV2.ID.make("config-command"))
        const skill = yield* SkillV2.Service
        yield* skill.refreshBMAD(Location.projectDirectory(location.directory, location.project.directory), true)
        return yield* CommandV2.Service.use((command) => command.list())
      }),
    ),
  ),
)
