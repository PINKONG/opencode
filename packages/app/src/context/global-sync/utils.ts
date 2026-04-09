import type { Agent, Project, ProviderListResponse } from "@opencode-ai/sdk/v2/client"

export const cmp = (a: string, b: string) => (a < b ? -1 : a > b ? 1 : 0)

export function normalizeList<T>(input: unknown): T[] {
  return Array.isArray(input) ? input : []
}

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

export function normalizeAgentList(input: unknown): Agent[] {
  if (Array.isArray(input)) return input.filter(isAgent)
  if (isAgent(input)) return [input]
  if (!input || typeof input !== "object") return []
  return Object.values(input).filter(isAgent)
}

export function normalizeProviderList(input: unknown): ProviderListResponse {
  const item =
    input && typeof input === "object" && !Array.isArray(input)
      ? (input as {
          all?: unknown
          connected?: unknown
          default?: unknown
        })
      : undefined
  return {
    all: normalizeList<ProviderListResponse["all"][number]>(item?.all)
      .filter(isProvider)
      .map((provider) => ({
        ...provider,
        models: Object.fromEntries(Object.entries(provider.models).filter(([, info]) => info.status !== "deprecated")),
      })),
    connected: normalizeList<string>(item?.connected),
    default:
      item?.default && typeof item.default === "object" && !Array.isArray(item.default)
        ? (item.default as ProviderListResponse["default"])
        : {},
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
