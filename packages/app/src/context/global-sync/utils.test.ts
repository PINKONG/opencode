import { describe, expect, test } from "bun:test"
import type { Agent } from "@opencode-ai/sdk/v2/client"
import { normalizeAgentList, normalizeList, normalizeProviderList } from "./utils"

const agent = (name = "build") =>
  ({
    name,
    mode: "primary",
    permission: {},
    options: {},
  }) as Agent

const model = (status?: "alpha" | "beta" | "deprecated") => ({
  id: "gpt-4o-mini",
  name: "GPT-4o mini",
  release_date: "2024-01-01",
  attachment: false,
  reasoning: false,
  temperature: true,
  tool_call: true,
  limit: {
    context: 128_000,
    output: 4_096,
  },
  options: {},
  status,
})

describe("normalizeAgentList", () => {
  test("keeps array payloads", () => {
    expect(normalizeAgentList([agent("build"), agent("docs")])).toEqual([agent("build"), agent("docs")])
  })

  test("wraps a single agent payload", () => {
    expect(normalizeAgentList(agent("docs"))).toEqual([agent("docs")])
  })

  test("extracts agents from keyed objects", () => {
    expect(
      normalizeAgentList({
        build: agent("build"),
        docs: agent("docs"),
      }),
    ).toEqual([agent("build"), agent("docs")])
  })

  test("drops invalid payloads", () => {
    expect(normalizeAgentList({ name: "AbortError" })).toEqual([])
    expect(normalizeAgentList([{ name: "build" }, agent("docs")])).toEqual([agent("docs")])
  })
})

describe("normalizeList", () => {
  test("keeps array payloads", () => {
    expect(normalizeList(["a", "b"])).toEqual(["a", "b"])
  })

  test("drops non-array payloads", () => {
    expect(normalizeList("<!doctype html>")).toEqual([])
    expect(normalizeList({ data: [] })).toEqual([])
    expect(normalizeList(undefined)).toEqual([])
  })
})

describe("normalizeProviderList", () => {
  test("keeps provider arrays and filters deprecated models", () => {
    expect(
      normalizeProviderList({
        all: [
          {
            id: "openai",
            name: "OpenAI",
            env: [],
            npm: "",
            models: {
              good: model("beta"),
              old: model("deprecated"),
            },
          },
        ],
        connected: ["openai"],
        default: {},
      }),
    ).toEqual({
      all: [
        {
          id: "openai",
          name: "OpenAI",
          env: [],
          npm: "",
          models: {
            good: model("beta"),
          },
        },
      ],
      connected: ["openai"],
      default: {},
    })
  })

  test("drops invalid provider payloads", () => {
    expect(normalizeProviderList("<!doctype html>" as never)).toEqual({
      all: [],
      connected: [],
      default: {},
    })
  })
})
