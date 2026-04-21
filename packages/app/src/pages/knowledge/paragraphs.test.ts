import { describe, expect, test } from "bun:test"
import { loadDocument, loadParagraphs } from "./paragraph-data"

describe("knowledge paragraph data helpers", () => {
  test("loads and parses document detail through knowledge api", async () => {
    const seen: string[] = []
    const api = {
      document: async () => {
        seen.push("document")
        return {
          dataset: {
            id: "dataset-1",
            name: "MoreDev",
          },
          document: {
            id: "document-1",
            dataset_id: "dataset-1",
            name: "安装部署.md",
            paragraph_count: 338,
            hit_handling_method: "optimization",
          },
        }
      },
    }

    const out = await loadDocument(api)

    expect(seen).toEqual(["document"])
    expect(out.document.name).toBe("安装部署.md")
    expect(out.document.paragraph_count).toBe(338)
  })

  test("loads and parses paragraph pages through knowledge api", async () => {
    const seen: unknown[] = []
    const api = {
      paragraphs: async (input: unknown) => {
        seen.push(input)
        return {
          dataset: {
            id: "dataset-1",
            name: "MoreDev",
          },
          document: {
            id: "document-1",
            name: "安装部署.md",
            paragraph_count: 338,
          },
          page: {
            limit: 20,
            offset: 20,
            total: 338,
            has_more: true,
            records: [
              {
                id: "paragraph-1",
                dataset_id: "dataset-1",
                document_id: "document-1",
                title: "# 安装部署",
                content: "first paragraph",
                is_active: true,
              },
            ],
          },
        }
      },
    }

    const out = await loadParagraphs(api, {
      dataset: "dataset-1",
      document: "document-1",
      limit: 20,
      offset: 20,
    })

    expect(seen).toEqual([
      {
        dataset: "dataset-1",
        document: "document-1",
        limit: 20,
        offset: 20,
      },
    ])
    expect(out.page.offset).toBe(20)
    expect(out.page.records[0]?.id).toBe("paragraph-1")
  })
})
