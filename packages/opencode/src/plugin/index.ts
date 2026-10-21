import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import type {
  Hooks,
  PluginInput,
  Plugin as PluginInstance,
  PluginModule,
  WorkspaceAdapter as PluginWorkspaceAdapter,
} from "@opencode-ai/plugin"
import { Config } from "@/config/config"
import { createOpencodeClient } from "@opencode-ai/sdk"
import { ServerAuth } from "@/server/auth"
import { CodexAuthPlugin } from "./openai/codex"
import { Session } from "@/session/session"
import { NamedError } from "@opencode-ai/core/util/error"
import { CopilotAuthPlugin } from "./github-copilot/copilot"
import { ModalPlugin } from "./modal/modal"
import { gitlabAuthPlugin as GitlabAuthPlugin } from "opencode-gitlab-auth"
import { PoeAuthPlugin } from "opencode-poe-auth"
import { CloudflareAIGatewayAuthPlugin, CloudflareWorkersAuthPlugin } from "./cloudflare"
import { AzureAuthPlugin } from "./azure"
import { DigitalOceanAuthPlugin } from "./digitalocean"
import { XaiAuthPlugin } from "./xai"
import { CerebrasPlugin } from "./cerebras"
import { SnowflakeCortexAuthPlugin } from "./snowflake-cortex"
import { Effect, Layer, Context } from "effect"
import { EffectBridge } from "@/effect/bridge"
import { InstanceState } from "@/effect/instance-state"
import { errorMessage } from "@/util/error"
import { PluginLoader } from "./loader"
import { parsePluginSpecifier, readPluginId, readV1Plugin, resolvePluginId } from "./shared"
import { registerAdapter } from "@/control-plane/adapters"
import type { WorkspaceAdapter } from "@/control-plane/types"
import { RuntimeFlags } from "@/effect/runtime-flags"
import { EventV2Bridge } from "@/event-v2-bridge"
import { InstallationChannel } from "@opencode-ai/core/installation/version"
import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { observePluginHook } from "./diagnostic"

type State = {
  hooks: Hooks[]
  hookIDs: string[]
}

// Hook names that follow the (input, output) => Promise<void> trigger pattern
type TriggerName = {
  [K in keyof Hooks]-?: NonNullable<Hooks[K]> extends (input: any, output: any) => Promise<void> ? K : never
}[keyof Hooks]

export interface Interface {
  readonly trigger: <
    Name extends TriggerName,
    Input = Parameters<Required<Hooks>[Name]>[0],
    Output = Parameters<Required<Hooks>[Name]>[1],
  >(
    name: Name,
    input: Input,
    output: Output,
    diagnostic?: DiagnosticTrace.TraceContext,
  ) => Effect.Effect<Output>
  readonly list: () => Effect.Effect<Hooks[]>
  readonly init: () => Effect.Effect<void>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/Plugin") {}

export function experimentalWebSocketsEnabled(input: { enabled: boolean; channel?: string }) {
  return input.enabled || ["local", "dev", "beta"].includes(input.channel ?? InstallationChannel)
}

// Built-in plugins that are directly imported (not installed from npm)
function internalPlugins(flags: RuntimeFlags.Info): PluginInstance[] {
  return [
    // Temporary rollout: pre-release builds use WebSockets by default; releases require explicit opt-in.
    (input) =>
      CodexAuthPlugin(input, {
        experimentalWebSockets: experimentalWebSocketsEnabled({ enabled: flags.experimentalWebSockets }),
      }),
    CopilotAuthPlugin,
    ModalPlugin,
    GitlabAuthPlugin,
    PoeAuthPlugin,
    CloudflareWorkersAuthPlugin,
    CloudflareAIGatewayAuthPlugin,
    AzureAuthPlugin,
    DigitalOceanAuthPlugin,
    SnowflakeCortexAuthPlugin,
    XaiAuthPlugin,
    CerebrasPlugin,
  ]
}

function isServerPlugin(value: unknown): value is PluginInstance {
  return typeof value === "function"
}

function getServerPlugin(value: unknown) {
  if (isServerPlugin(value)) return value
  if (!value || typeof value !== "object" || !("server" in value)) return
  if (!isServerPlugin(value.server)) return
  return value.server
}

function getLegacyPlugins(mod: Record<string, unknown>) {
  const seen = new Set<unknown>()
  const result: PluginInstance[] = []

  for (const entry of Object.values(mod)) {
    if (seen.has(entry)) continue
    seen.add(entry)
    const plugin = getServerPlugin(entry)
    if (!plugin) throw new TypeError("Plugin export is not a function")
    result.push(plugin)
  }

  return result
}

async function applyPlugin(load: PluginLoader.Loaded, input: PluginInput, hooks: Hooks[]) {
  const plugin = readV1Plugin(load.mod, load.spec, "server", "detect")
  if (plugin) {
    await resolvePluginId(load.source, load.spec, load.target, readPluginId(plugin.id, load.spec), load.pkg)
    hooks.push(await (plugin as PluginModule).server(input, load.options))
    return
  }

  for (const server of getLegacyPlugins(load.mod)) {
    hooks.push(await server(input, load.options))
  }
}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const events = yield* EventV2Bridge.Service
    const config = yield* Config.Service
    const flags = yield* RuntimeFlags.Service
    const diagnostics = yield* DiagnosticTrace.Service

    const state = yield* InstanceState.make<State>(
      Effect.fn("Plugin.state")(function* (ctx) {
        const hooks: Hooks[] = []
        const hookIDs: string[] = []
        const bridge = yield* EffectBridge.make()
        const global = yield* config.getGlobal()
        yield* diagnostics.configure({
          enabled: global.diagnostics?.enabled ?? false,
          rawPayloads: global.diagnostics?.rawPayloads ?? false,
          streaming: global.diagnostics?.streaming ?? false,
          retentionDays: global.diagnostics?.retentionDays ?? 14,
          maxTotalBytes: global.diagnostics?.maxTotalBytes ?? 2 * 1024 * 1024 * 1024,
        })

        function publishPluginError(message: string) {
          bridge.fork(events.publish(Session.Event.Error, { error: new NamedError.Unknown({ message }).toObject() }))
        }

        const { Server } = yield* Effect.promise(() => import("../server/server"))

        const serverUrl = Server.url
        const client = createOpencodeClient({
          baseUrl: serverUrl?.toString() ?? "http://localhost:4096",
          directory: ctx.directory,
          headers: ServerAuth.headers(),
          ...(serverUrl ? {} : { fetch: async (...args) => Server.Default().app.fetch(...args) }),
        })
        const cfg = yield* config.get()
        const input: PluginInput = {
          client,
          project: ctx.project,
          worktree: ctx.worktree,
          directory: ctx.directory,
          experimental_workspace: {
            register(type: string, adapter: PluginWorkspaceAdapter) {
              registerAdapter(ctx.project.id, type, adapter as WorkspaceAdapter)
            },
          },
          get serverUrl(): URL {
            return Server.url ?? new URL("http://localhost:4096")
          },
          // @ts-expect-error
          $: typeof Bun === "undefined" ? undefined : Bun.$,
        }

        for (const plugin of flags.disableDefaultPlugins ? [] : internalPlugins(flags)) {
          const init = yield* Effect.tryPromise({
            try: () => plugin(input),
            catch: errorMessage,
          }).pipe(
            Effect.tapError((error) => Effect.logError("failed to load internal plugin", { name: plugin.name, error })),
            Effect.tapError((error) => diagnostics.complete(undefined, "plugin.loaded", {
              summary: { pluginId: plugin.name, source: "internal", error: DiagnosticTrace.errorInfo(error, "plugin") },
            }, { status: "failed" })),
            Effect.option,
          )
          if (init._tag === "Some") {
            hooks.push(init.value)
            hookIDs.push(plugin.name)
            yield* diagnostics.complete(undefined, "plugin.loaded", {
              summary: { pluginId: plugin.name, source: "internal" },
            })
          }
        }

        const plugins = flags.pure ? [] : (cfg.plugin_origins ?? [])
        if (flags.pure && cfg.plugin_origins?.length) {
        }
        if (plugins.length) yield* config.waitForDependencies()

        const loaded = yield* Effect.promise(() =>
          PluginLoader.loadExternal({
            items: plugins,
            kind: "server",
            report: {
              start(candidate) {},
              missing(candidate, _retry, message) {
                bridge.fork(diagnostics.complete(undefined, "plugin.loaded", {
                  summary: { pluginId: candidate.plan.spec, source: "external", stage: "missing", error: DiagnosticTrace.errorInfo(message, "plugin") },
                }, { status: "failed" }))
              },
              error(candidate, _retry, stage, error, resolved) {
                const spec = candidate.plan.spec
                const cause = error instanceof Error ? (error.cause ?? error) : error
                const message = stage === "load" ? errorMessage(error) : errorMessage(cause)
                bridge.fork(diagnostics.complete(undefined, "plugin.loaded", {
                  summary: { pluginId: spec, source: "external", stage, error: DiagnosticTrace.errorInfo(error, "plugin"), resolved },
                }, { status: "failed" }))

                if (stage === "install") {
                  const parsed = parsePluginSpecifier(spec)
                  publishPluginError(`Failed to install plugin ${parsed.pkg}@${parsed.version}: ${message}`)
                  return
                }

                if (stage === "compatibility") {
                  publishPluginError(`Plugin ${spec} skipped: ${message}`)
                  return
                }

                if (stage === "entry") {
                  publishPluginError(`Failed to load plugin ${spec}: ${message}`)
                  return
                }

                publishPluginError(`Failed to load plugin ${spec}: ${message}`)
              },
            },
          }),
        )
        for (const load of loaded) {
          if (!load) continue
          const before = hooks.length

          // Keep plugin execution sequential so hook registration and execution
          // order remains deterministic across plugin runs.
          yield* Effect.tryPromise({
            try: () => applyPlugin(load, input, hooks),
            catch: (err) => {
              const message = errorMessage(err)
              return message
            },
          }).pipe(
            Effect.tapError((error) => Effect.logError("failed to load plugin", { path: load.spec, error })),
            Effect.tapError((error) => diagnostics.complete(undefined, "plugin.loaded", {
              summary: { pluginId: load.spec, source: load.source, error: DiagnosticTrace.errorInfo(error, "plugin") },
            }, { status: "failed" })),
            Effect.catch(() => {
              // TODO: make proper events for this
              // events.publish(Session.Event.Error, {
              //   error: new NamedError.Unknown({
              //     message: `Failed to load plugin ${load.spec}: ${message}`,
              //   }).toObject(),
              // })
              return Effect.void
            }),
          )
          for (let index = before; index < hooks.length; index++) {
            hookIDs.push(load.spec)
            yield* diagnostics.complete(undefined, "plugin.loaded", {
              summary: { pluginId: load.spec, source: load.source },
            })
          }
        }

        // Notify plugins of current config
        for (const hook of hooks) {
          yield* Effect.tryPromise({
            try: () => Promise.resolve((hook as any).config?.(cfg)),
            catch: errorMessage,
          }).pipe(
            Effect.tapError((error) => Effect.logError("plugin config hook failed", { error })),
            Effect.tapError((error) => diagnostics.complete(undefined, "plugin.hook.failed", {
              summary: { hook: "config", error: DiagnosticTrace.errorInfo(error, "plugin") },
            }, { status: "failed" })),
            Effect.ignore,
          )
        }

        const unsubscribe = yield* events.listen((event) => {
          if (event.location?.directory !== ctx.directory) return Effect.void
          return Effect.sync(() => {
            for (const hook of hooks) {
              void hook["event"]?.({ event: { id: event.id, type: event.type, properties: event.data } as any })
            }
          })
        })
        yield* Effect.addFinalizer(() => unsubscribe)

        yield* Effect.addFinalizer(() =>
          Effect.forEach(
            hooks,
            (hook) =>
              Effect.tryPromise({
                try: () => Promise.resolve(hook.dispose?.()),
                catch: errorMessage,
              }).pipe(
                Effect.tapError((error) => Effect.logError("plugin dispose hook failed", { error })),
                Effect.ignore,
              ),
            { discard: true },
          ),
        )

        return { hooks, hookIDs }
      }),
    )

    const trigger = Effect.fn("Plugin.trigger")(function* <
      Name extends TriggerName,
      Input = Parameters<Required<Hooks>[Name]>[0],
      Output = Parameters<Required<Hooks>[Name]>[1],
    >(name: Name, input: Input, output: Output, diagnostic?: DiagnosticTrace.TraceContext) {
      if (!name) return output
      const s = yield* InstanceState.get(state)
      for (const [index, hook] of s.hooks.entries()) {
        const fn = hook[name] as any
        if (!fn) continue
        yield* Effect.promise(() => observePluginHook({
          diagnostics,
          context: diagnostic,
          pluginId: s.hookIDs[index] ?? "unknown",
          hook: name,
          input,
          output,
          execute: () => Promise.resolve(fn(input, output)),
        }))
      }
      return output
    })

    const list = Effect.fn("Plugin.list")(function* () {
      const s = yield* InstanceState.get(state)
      return s.hooks
    })

    const init = Effect.fn("Plugin.init")(function* () {
      yield* InstanceState.get(state)
    })

    return Service.of({ trigger, list, init })
  }),
)

export const node = LayerNode.make({
  service: Service,
  layer: layer,
  deps: [DiagnosticTrace.node, EventV2Bridge.node, Config.node, RuntimeFlags.node],
})

export * as Plugin from "."
