import { describe, expect, test } from "bun:test"
import { loadDatasets, selectKnowledgeClient } from "./datasets"

describe("knowledge dataset helpers", () => {
  test("auto-selects the only available client", () => {
    expect(selectKnowledgeClient(["alpha"])).toBe("alpha")
  })

  test("keeps a valid picked client when multiple clients exist", () => {
    expect(selectKnowledgeClient(["alpha", "beta"], "beta")).toBe("beta")
  })

  test("drops an invalid picked client when multiple clients exist", () => {
    expect(selectKnowledgeClient(["alpha", "beta"], "gamma")).toBeUndefined()
  })

  test("does not auto-select when multiple clients exist", () => {
    expect(selectKnowledgeClient(["alpha", "beta"])).toBeUndefined()
  })

  test("loads and parses datasets through knowledge api", async () => {
    const seen: string[] = []
    const api = {
      datasets: async () => {
        seen.push("datasets")
        return {
          datasets: [
            {
              id: "dataset-1",
              name: "MoreDev",
              desc: "MoreDev dataset",
              document_count: 82,
              char_length: 32529.1,
            },
          ],
          truncated: false,
        }
      },
    }

    const out = await loadDatasets(api)

    expect(seen).toEqual(["datasets"])
    expect(out.truncated).toBe(false)
    expect(out.datasets[0]?.name).toBe("MoreDev")
  })
})
