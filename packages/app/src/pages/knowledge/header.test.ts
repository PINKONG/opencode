import { describe, expect, test } from "bun:test"
import { knowledgeCrumbs } from "./route"

describe("knowledge header helpers", () => {
  test("uses dataset name instead of current page title in breadcrumb", () => {
    const out = knowledgeCrumbs({
      root: "Knowledge",
      dataset: "dataset-1",
      datasetName: "Industrial KB",
      document: "document-1",
      documentLabel: "Document paragraphs",
      dir: "/tmp/demo",
      client: "maxkb-prod",
    })

    expect(out.map((item) => item.label)).toEqual(["Knowledge", "Industrial KB", "Document paragraphs"])
  })
})
