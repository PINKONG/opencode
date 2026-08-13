import type {
  AgentListOutput,
  ModelDefaultOutput,
  ModelListOutput,
  PermissionV2Request,
  ProviderListOutput,
} from "@opencode-ai/client/promise"
import type { Agent, PermissionRequest, Project, Provider, ProviderListResponse } from "@opencode-ai/sdk/v2/client"
import type { Project as CurrentProject } from "@opencode-ai/client/promise"
import { NormalizedProviderListResponse } from "@opencode-ai/session-ui/context"
export { pathKey as directoryKey, type PathKey as DirectoryKey } from "@/utils/path-key"

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function normalizeList<T>(input: unknown): T[] {
  return Array.isArray(input) ? input : []
}

type CurrentAgent = AgentListOutput["data"][number]
type CurrentProvider = ProviderListOutput["data"][number]
type CurrentModel = ModelListOutput["data"][number]

function isAgent(input: unknown): input is Agent {
  if (!input || typeof input !== "object") return false
  const item = input as { name?: unknown; mode?: unknown }
  if (typeof item.name !== "string") return false
  return item.mode === "subagent" || item.mode === "primary" || item.mode === "all"
}

function isProvider(input: unknown): input is ProviderListResponse["all"][number] {
  if (!input || typeof input !== "object" || Array.isArray(input)) return false
  const item = input as { models?: unknown }
  return !!item.models && typeof item.models === "object" && !Array.isArray(item.models)
}

function isCurrentAgent(input: unknown): input is CurrentAgent {
  if (!input || typeof input !== "object") return false
  const item = input as { id?: unknown; request?: unknown; permissions?: unknown }
  return typeof item.id === "string" && !!item.request && Array.isArray(item.permissions)
}

function isCurrentProvider(input: unknown): input is CurrentProvider {
  if (!input || typeof input !== "object") return false
  return typeof (input as { id?: unknown }).id === "string"
}

function isCurrentModel(input: unknown): input is CurrentModel {
  if (!input || typeof input !== "object") return false
  const item = input as { id?: unknown; providerID?: unknown; capabilities?: unknown; variants?: unknown }
  return (
    typeof item.id === "string" &&
    typeof item.providerID === "string" &&
    !!item.capabilities &&
    Array.isArray(item.variants)
  )
}

export function normalizeAgentList(input: AgentListOutput["data"] | Agent[] | unknown): Agent[] {
  const list = normalizeList<CurrentAgent | Agent>(input)
  if (list.every((agent) => !("request" in agent))) return list.filter(isAgent)
  return list.filter(isCurrentAgent).map((agent) => ({
    name: agent.id,
    description: agent.description,
    mode: agent.mode,
    hidden: agent.hidden,
    temperature:
      typeof agent.request.settings.temperature === "number" ? agent.request.settings.temperature : undefined,
    topP: typeof agent.request.settings.topP === "number" ? agent.request.settings.topP : undefined,
    color: agent.color,
    permission: agent.permissions.map((rule) => ({
      permission: rule.action,
      pattern: rule.resource,
      action: rule.effect,
    })),
    model: agent.model && { providerID: agent.model.providerID, modelID: agent.model.id },
    variant: agent.model?.variant,
    prompt: agent.system,
    options: agent.request.settings,
    steps: agent.steps,
  }))
}

export function normalizePermissionRequest(input: PermissionV2Request | PermissionRequest): PermissionRequest {
  if ("permission" in input) return input
  return {
    id: input.id,
    sessionID: input.sessionID,
    permission: input.action,
    patterns: input.resources,
    always: input.save ?? [],
    metadata: input.metadata ?? {},
    tool:
      input.source?.type === "tool" ? { messageID: input.source.messageID, callID: input.source.callID } : undefined,
  }
}

export function normalizeProviderList(
  providers: ProviderListOutput["data"] | ProviderListResponse | unknown,
  models?: ModelListOutput["data"] | unknown,
  defaultModel?: ModelDefaultOutput["data"],
): NormalizedProviderListResponse {
  if (!Array.isArray(providers) && providers && typeof providers === "object" && "all" in providers) {
    const normalized: ProviderListResponse = {
      all: normalizeList<ProviderListResponse["all"][number]>((providers as { all?: unknown }).all).filter(isProvider),
      connected: normalizeList<string>((providers as { connected?: unknown }).connected),
      default:
        "default" in providers &&
        providers.default &&
        typeof providers.default === "object" &&
        !Array.isArray(providers.default)
          ? (providers.default as ProviderListResponse["default"])
          : {},
    }
    return {
      ...normalized,
      all: new Map(
        normalized.all.map((provider) => [
          provider.id,
          {
            ...provider,
            models: Object.fromEntries(
              Object.entries(provider.models).filter(([, model]) => model.status !== "deprecated"),
            ),
          },
        ]),
      ),
    }
  }
  const providerList = normalizeList<CurrentProvider>(providers).filter(isCurrentProvider)
  const modelList = normalizeList<CurrentModel>(models).filter(isCurrentModel)
  const all = new Map<string, Provider>()

  for (const provider of providerList) {
    all.set(provider.id, {
      id: provider.id,
      name: provider.name,
      source: "custom",
      env: [],
      options: provider.settings ?? {},
      models: {},
    })
  }

  for (const model of modelList) {
    const provider = all.get(model.providerID)
    if (!provider || model.status === "deprecated") continue
    const cost = model.cost.find((item) => item.tier === undefined) ?? model.cost[0]
    provider.models[model.id] = {
      id: model.id,
      providerID: model.providerID,
      api: {
        id: model.modelID,
        url: "",
        npm: model.package ?? provider.id,
      },
      name: model.name,
      family: model.family,
      capabilities: {
        temperature: false,
        reasoning: false,
        attachment: model.capabilities.input.some((item) => item !== "text"),
        toolcall: model.capabilities.tools,
        input: {
          text: model.capabilities.input.includes("text"),
          audio: model.capabilities.input.includes("audio"),
          image: model.capabilities.input.includes("image"),
          video: model.capabilities.input.includes("video"),
          pdf: model.capabilities.input.includes("pdf"),
        },
        output: {
          text: model.capabilities.output.includes("text"),
          audio: model.capabilities.output.includes("audio"),
          image: model.capabilities.output.includes("image"),
          video: model.capabilities.output.includes("video"),
          pdf: model.capabilities.output.includes("pdf"),
        },
        interleaved: false,
      },
      cost: {
        input: cost?.input ?? 0,
        output: cost?.output ?? 0,
        cache: {
          read: cost?.cache.read ?? 0,
          write: cost?.cache.write ?? 0,
        },
      },
      limit: model.limit,
      status: model.status,
      options: model.settings ?? {},
      headers: model.headers ?? {},
      release_date: new Date(model.time.released).toISOString().slice(0, 10),
      variants: Object.fromEntries(model.variants.map((variant) => [variant.id, variant.settings ?? {}])),
    }
  }

  return {
    all,
    connected: providerList.map((provider) => provider.id),
    defaultModel: defaultModel ? { providerID: defaultModel.providerID, modelID: defaultModel.id } : null,
    default: Object.fromEntries(
      providerList.flatMap((provider) => {
        const model =
          defaultModel?.providerID === provider.id
            ? defaultModel
            : modelList.find((item) => item.providerID === provider.id && item.status !== "deprecated")
        return model ? [[provider.id, model.id]] : []
      }),
    ),
  }
}

export function sanitizeProject(project: Project) {
  if (!project.icon?.url && !project.icon?.override) return project
  return {
    ...project,
    icon: {
      ...project.icon,
      url: undefined,
      override: undefined,
    },
  }
}

export function normalizeProjectInfo(project: Project | CurrentProject): Project {
  return {
    ...project,
    vcs: project.vcs === "git" ? "git" : undefined,
  }
}
