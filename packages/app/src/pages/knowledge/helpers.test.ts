import { describe, expect, test } from "bun:test"
import type { McpResource } from "@opencode-ai/sdk/v2/client"
import { knowledgeAvailabilityKey, loadKnowledgeAvailability } from "./helpers"

const item = (input: Partial<McpResource> & Pick<McpResource, "client" | "uri" | "name">): McpResource => ({
  description: undefined,
  mimeType: undefined,
  ...input,
})

describe("knowledge availability helpers", () => {
  test("builds a directory-scoped query key", () => {
    expect(knowledgeAvailabilityKey("/tmp/a")).toEqual(["maxkb-availability", "/tmp/a"])
    expect(knowledgeAvailabilityKey("/tmp/b")).toEqual(["maxkb-availability", "/tmp/b"])
    expect(knowledgeAvailabilityKey("/tmp/a")).not.toEqual(knowledgeAvailabilityKey("/tmp/b"))
  })

  test("loads available maxkb clients from resource list", async () => {
    const seen: unknown[] = []
    const sdk = {
      experimental: {
        resource: {
          list: async (input?: unknown) => {
            seen.push(input)
            return {
              data: {
                a: item({ client: "alpha", uri: "maxkb://datasets", name: "Datasets" }),
                b: item({ client: "beta", uri: "maxkb://datasets?view=compact", name: "Datasets" }),
                c: item({ client: "alpha", uri: "maxkb://datasets", name: "Duplicate" }),
              },
            }
          },
        },
      },
    }

    const out = await loadKnowledgeAvailability("/tmp/demo", sdk)

    expect(seen).toEqual([{ directory: "/tmp/demo" }])
    expect(out).toEqual({
      directory: "/tmp/demo",
      clients: ["alpha", "beta"],
    })
  })

  test("returns unavailable when no maxkb resource exists", async () => {
    const sdk = {
      experimental: {
        resource: {
          list: async () => ({
            data: {
              a: item({ client: "alpha", uri: "file:///tmp/demo.txt", name: "File" }),
              b: item({ client: "beta", uri: "maxkb://datasets/1/categories", name: "Categories" }),
            },
          }),
        },
      },
    }

    const out = await loadKnowledgeAvailability("/tmp/demo", sdk)

    expect(out).toEqual({
      directory: "/tmp/demo",
      clients: [],
    })
  })
})
