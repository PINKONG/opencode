import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"
import { createRoot } from "solid-js"

let useProviders: typeof import("./use-providers").useProviders

let params: { dir?: string } = {}
let projectReady = true

const globalProvider = {
  all: new Map([["openai", { id: "openai", models: { "gpt-4.1": {} } }]]),
  connected: ["openai"],
  default: { openai: "gpt-4.1" },
}

const projectProvider = {
  all: new Map([["anthropic", { id: "anthropic", models: { "claude-3-7-sonnet": {} } }]]),
  connected: ["anthropic"],
  default: { anthropic: "claude-3-7-sonnet" },
}

beforeAll(async () => {
  mock.module("@solidjs/router", () => ({
    useParams: () => params,
  }))

  mock.module("@/utils/base64", () => ({
    decode64: (value?: string) => (value === "encoded-dir" ? "/repo/worktree" : ""),
  }))

  mock.module("@/context/server-sync", () => ({
    useServerSync: () => () => ({
      data: { provider: globalProvider },
      child: () => [{ provider_ready: projectReady, provider: projectProvider }],
    }),
  }))

  const mod = await import("./use-providers")
  useProviders = mod.useProviders
})

beforeEach(() => {
  params = { dir: "encoded-dir" }
  projectReady = true
})

describe("useProviders", () => {
  test("uses project providers when project store is ready", () => {
    const ids = createRoot((dispose) => {
      const providers = useProviders()
      const value = [...providers.all().values()].map((item) => item.id)
      dispose()
      return value
    })

    expect(ids).toEqual(["anthropic"])
  })

  test("falls back to global providers when project store is not ready", () => {
    projectReady = false
    const ids = createRoot((dispose) => {
      const providers = useProviders()
      const value = [...providers.all().values()].map((item) => item.id)
      dispose()
      return value
    })

    expect(ids).toEqual(["openai"])
  })

  test("falls back to global providers when there is no project directory", () => {
    params = {}
    const ids = createRoot((dispose) => {
      const providers = useProviders()
      const value = [...providers.all().values()].map((item) => item.id)
      dispose()
      return value
    })

    expect(ids).toEqual(["openai"])
  })
})
