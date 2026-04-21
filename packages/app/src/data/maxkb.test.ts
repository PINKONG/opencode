import { describe, expect, test } from "bun:test"
import type { McpResource } from "@opencode-ai/sdk/v2/client"
import {
  MaxkbToolError,
  MaxkbCategoryPayload,
  MaxkbDatasetPayload,
  MaxkbDocumentDetailPayload,
  MaxkbDocumentPagePayload,
  MaxkbParagraphPagePayload,
  extractMaxkbResourceText,
  extractMaxkbToolText,
  findMaxkbClients,
  parseMaxkbText,
  shouldRetryMaxkb,
} from "./maxkb"
import { createKnowledgeApi } from "./knowledge-api"

const fixture = (name: string) => Bun.file(new URL(`../../../../docs/plans/maxkb-manual-validation/${name}`, import.meta.url))

const item = (input: Partial<McpResource> & Pick<McpResource, "client" | "uri" | "name">): McpResource => ({
  description: undefined,
  mimeType: undefined,
  ...input,
})

describe("findMaxkbClients", () => {
  test("detects clients exposing maxkb datasets resource", () => {
    const out = findMaxkbClients({
      a: item({ client: "alpha", uri: "maxkb://datasets", name: "Datasets" }),
      b: item({ client: "beta", uri: "maxkb://datasets?view=compact", name: "Datasets" }),
      c: item({ client: "alpha", uri: "maxkb://datasets", name: "Datasets duplicate" }),
    })

    expect(out).toEqual(["alpha", "beta"])
  })

  test("ignores non-root maxkb uris", () => {
    const out = findMaxkbClients({
      a: item({ client: "alpha", uri: "maxkb://datasets/1/categories", name: "Categories" }),
      b: item({ client: "beta", uri: "file:///tmp/demo.txt", name: "File" }),
    })

    expect(out).toEqual([])
  })
})

describe("maxkb payload parsing", () => {
  test("parses dataset payload fixture", async () => {
    const out = MaxkbDatasetPayload.parse(await fixture("05-datasets-payload.json").json())

    expect(out.datasets[0]?.id).toBeTruthy()
    expect(out.datasets[0]?.name).toBeTruthy()
    expect(out.truncated).toBe(false)
  })

  test("parses category payload", () => {
    const out = MaxkbCategoryPayload.parse({
      dataset: {
        id: "dataset-1",
        name: "MoreDev",
      },
      statistics: {
        all_documents: 2,
        uncategorized: 1,
      },
      categories: [
        {
          id: "category-1",
          name: "Deployment",
          parent_id: null,
          document_count: 1,
          children: [],
        },
      ],
    })

    expect(out.statistics.all_documents).toBe(2)
    expect(out.categories[0]?.children).toEqual([])
  })

  test("parses document detail payload", () => {
    const out = MaxkbDocumentDetailPayload.parse({
      dataset: {
        id: "dataset-1",
        name: "MoreDev",
      },
      document: {
        id: "document-1",
        dataset_id: "dataset-1",
        name: "安装部署.md",
        paragraph_count: 338,
      },
    })

    expect(out.document.paragraph_count).toBe(338)
  })

  test("parses paged document payload", () => {
    const out = MaxkbDocumentPagePayload.parse({
      dataset: {
        id: "dataset-1",
        name: "MoreDev",
      },
      filters: {
        category_id: null,
        name: null,
      },
      page: {
        current_page: 1,
        page_size: 20,
        total: 1,
        records: [
          {
            id: "document-1",
            dataset_id: "dataset-1",
            name: "安装部署.md",
          },
        ],
      },
    })

    expect(out.page.records[0]?.name).toBe("安装部署.md")
  })

  test("parses paged paragraph payload", () => {
    const out = MaxkbParagraphPagePayload.parse({
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
        offset: 0,
        total: 338,
        has_more: true,
        records: [
          {
            id: "paragraph-1",
            document_id: "document-1",
            dataset_id: "dataset-1",
            title: "安装步骤",
            content: "内容",
          },
        ],
      },
    })

    expect(out.page.has_more).toBe(true)
    expect(out.page.records[0]?.title).toBe("安装步骤")
  })

  test("extracts text from resource result", () => {
    const out = extractMaxkbResourceText({
      contents: [
        {
          uri: "maxkb://datasets",
          mimeType: "application/json",
          text: "{\"datasets\":[],\"truncated\":false}",
        },
      ],
    })

    expect(out).toBe("{\"datasets\":[],\"truncated\":false}")
  })

  test("extracts text from tool result", () => {
    const out = extractMaxkbToolText({
      content: [
        {
          type: "text",
          text: "{\"page\":{\"total\":0}}",
        },
      ],
    })

    expect(out).toBe("{\"page\":{\"total\":0}}")
  })

  test("throws tool error message when result isError=true", () => {
    expect(() =>
      extractMaxkbToolText({
        isError: true,
        content: [
          {
            type: "text",
            text: "The knowledge base is not authorized【0141f9ba-3482-11f1-a43f-0242ac150003】",
          },
        ],
      }),
    ).toThrow("The knowledge base is not authorized")
  })

  test("classifies tool errors as MaxkbToolError", () => {
    expect(() =>
      extractMaxkbToolText({
        isError: true,
        content: [{ type: "text", text: "no auth" }],
      }),
    ).toThrow(MaxkbToolError)
  })

  test("rejects invalid json text", () => {
    expect(() => parseMaxkbText("{", MaxkbDatasetPayload)).toThrow("Invalid MaxKB resource JSON")
  })

  test("rejects schema mismatch", () => {
    expect(() => parseMaxkbText("{\"datasets\":[]}", MaxkbDatasetPayload)).toThrow(
      "Invalid MaxKB resource payload at truncated",
    )
  })

  test("retries only non-tool errors", () => {
    expect(shouldRetryMaxkb({ count: 0, err: new Error("network") })).toBe(true)
    expect(shouldRetryMaxkb({ count: 2, err: new Error("network") })).toBe(true)
    expect(shouldRetryMaxkb({ count: 3, err: new Error("network") })).toBe(false)
    expect(shouldRetryMaxkb({ count: 0, err: new MaxkbToolError("forbidden") })).toBe(false)
  })
})

describe("createKnowledgeApi", () => {
  test("maps dataset and category reads to resource endpoints", async () => {
    const seen: unknown[] = []
    const sdk = {
      experimental: {
        resource: {
          read: async (input?: unknown) => {
            seen.push(input)
            if ((input as { uri?: string })?.uri?.endsWith("/categories")) {
              return {
                data: {
                  contents: [
                    {
                      text: "{\"dataset\":{\"id\":\"dataset-1\",\"name\":\"MoreDev\"},\"statistics\":{\"all_documents\":2,\"uncategorized\":1},\"categories\":[]}",
                    },
                  ],
                },
              }
            }
            return { data: { contents: [{ text: "{\"datasets\":[],\"truncated\":false}" }] } }
          },
        },
        tool: {
          call: async () => ({ data: { content: [{ text: "{\"page\":{\"limit\":20,\"offset\":0,\"total\":0,\"has_more\":false,\"records\":[]},\"dataset\":{\"id\":\"d\",\"name\":\"n\"},\"document\":{\"id\":\"doc\",\"name\":\"x\"}}" }] } }),
        },
      },
    }

    const api = createKnowledgeApi(sdk, "alpha")
    await api.datasets()
    await api.categories("dataset-1")

    expect(seen).toEqual([
      { client: "alpha", uri: "maxkb://datasets" },
      { client: "alpha", uri: "maxkb://datasets/dataset-1/categories" },
    ])
  })

  test("maps document and paragraph paging to tool endpoints", async () => {
    const seen: unknown[] = []
    const sdk = {
      experimental: {
        resource: {
          read: async () => ({ data: { contents: [{ text: "{\"datasets\":[],\"truncated\":false}" }] } }),
        },
        tool: {
          call: async (input?: unknown) => {
            seen.push(input)
            if ((input as { name?: string })?.name === "list_dataset_documents") {
              return {
                data: {
                  content: [
                    {
                      text: "{\"dataset\":{\"id\":\"dataset-1\",\"name\":\"n\"},\"filters\":{\"name\":null},\"page\":{\"current_page\":2,\"page_size\":20,\"total\":0,\"records\":[]}}",
                    },
                  ],
                },
              }
            }
            return {
              data: {
                content: [
                  {
                    text: "{\"dataset\":{\"id\":\"dataset-1\",\"name\":\"n\"},\"document\":{\"id\":\"document-1\",\"name\":\"d\"},\"page\":{\"limit\":20,\"offset\":40,\"total\":0,\"has_more\":false,\"records\":[]}}",
                  },
                ],
              },
            }
          },
        },
      },
    }

    const api = createKnowledgeApi(sdk, "alpha")
    await api.documents({
      dataset: "dataset-1",
      category: "category-1",
      page: 2,
      size: 20,
      name: "安装",
    })
    await api.paragraphs({
      dataset: "dataset-1",
      document: "document-1",
      limit: 20,
      offset: 40,
    })

    expect(seen).toEqual([
      {
        client: "alpha",
        name: "list_dataset_documents",
        arguments: {
          dataset_id: "dataset-1",
          category_id: "category-1",
          current_page: 2,
          page_size: 20,
          name: "安装",
        },
      },
      {
        client: "alpha",
        name: "get_document_paragraphs",
        arguments: {
          dataset_id: "dataset-1",
          document_id: "document-1",
          limit: 20,
          offset: 40,
        },
      },
    ])
  })
})
