import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

let useGlobalModelSelection: typeof import("./model-selection").useGlobalModelSelection

let configuredModel: string | undefined
let updateConfigCalls: Array<{ model?: string }> = []
let visibleCalls: Array<{ providerID: string; modelID: string; visible: boolean }> = []
let recentPushes: Array<{ providerID: string; modelID: string }> = []
let recentModels: Array<{ providerID: string; modelID: string }> = []
let params: { dir?: string } = {}

const providerState = {
  all: new Map([
    [
      "openai",
      {
        id: "openai",
        name: "OpenAI",
        models: {
          "gpt-5.7-pro": {
            id: "gpt-5.7-pro",
            name: "GPT-5.7 Pro",
            family: "gpt-5.7",
            release_date: "2026-01-01",
          },
          "gpt-5-mini": {
            id: "gpt-5-mini",
            name: "GPT-5 Mini",
            family: "gpt-5",
            release_date: "2026-01-02",
          },
        },
      },
    ],
    [
      "anthropic",
      {
        id: "anthropic",
        name: "Anthropic",
        models: {
          "claude-sonnet": {
            id: "claude-sonnet",
            name: "Claude Sonnet",
            family: "claude",
            release_date: "2026-01-03",
          },
        },
      },
    ],
  ]),
  connected: ["openai", "anthropic"],
  default: { openai: "gpt-5.7-pro" },
}

const list = () =>
  [...providerState.all.values()].flatMap((provider) =>
    Object.values(provider.models).map((model) => ({
      ...model,
      provider,
      latest: false,
    })),
  )

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => params,
  }))

  mock.module("@/utils/base64", () => ({
    decode64: () => "",
  }))

  mock.module("@/context/global-sync", () => ({
    useGlobalSync: () => ({
      data: {
        config: { model: configuredModel },
        provider: providerState,
      },
      child: () => [{ provider_ready: false, provider: providerState }],
      updateConfig: (next: { model?: string }) => {
        updateConfigCalls.push(next)
        configuredModel = next.model
        return Promise.resolve()
      },
    }),
  }))

  mock.module("@/context/models", () => ({
    useModels: () => ({
      list,
      find: (key: { providerID: string; modelID: string }) =>
        list().find((item) => item.provider.id === key.providerID && item.id === key.modelID),
      visible: () => true,
      setVisibility: (key: { providerID: string; modelID: string }, visible: boolean) => {
        visibleCalls.push({ ...key, visible })
      },
      recent: {
        list: () => recentModels,
        push: (key: { providerID: string; modelID: string }) => {
          recentPushes.push(key)
          recentModels = [key, ...recentModels]
        },
      },
    }),
  }))

  const mod = await import("./model-selection")
  useGlobalModelSelection = mod.useGlobalModelSelection
})

beforeEach(() => {
  configuredModel = undefined
  updateConfigCalls = []
  visibleCalls = []
  recentPushes = []
  recentModels = []
  params = {}
})

describe("useGlobalModelSelection", () => {
  test("uses configured global model when available", () => {
    configuredModel = "anthropic/claude-sonnet"

    const current = createRoot((dispose) => {
      const model = useGlobalModelSelection()
      const value = model.current()
      dispose()
      return value
    })

    expect(current?.provider.id).toBe("anthropic")
    expect(current?.id).toBe("claude-sonnet")
  })

  test("falls back to recent model when config is missing", () => {
    recentModels = [{ providerID: "openai", modelID: "gpt-5-mini" }]

    const current = createRoot((dispose) => {
      const model = useGlobalModelSelection()
      const value = model.current()
      dispose()
      return value
    })

    expect(current?.provider.id).toBe("openai")
    expect(current?.id).toBe("gpt-5-mini")
  })

  test("persists selection to global config and recent models", () => {
    createRoot((dispose) => {
      const model = useGlobalModelSelection()
      model.set({ providerID: "openai", modelID: "gpt-5.7-pro" }, { recent: true })
      dispose()
    })

    expect(updateConfigCalls).toEqual([{ model: "openai/gpt-5.7-pro" }])
    expect(visibleCalls).toEqual([{ providerID: "openai", modelID: "gpt-5.7-pro", visible: true }])
    expect(recentPushes).toEqual([{ providerID: "openai", modelID: "gpt-5.7-pro" }])
  })
})
