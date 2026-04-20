import { describe, expect, test } from "bun:test"
import {
  MaxkbCategoryPayload,
  MaxkbDatasetPayload,
  MaxkbDocumentDetailPayload,
  MaxkbDocumentPagePayload,
  MaxkbDocumentPayload,
  MaxkbParagraphPagePayload,
  MaxkbParagraphPayload,
  extractMaxkbText,
  extractMaxkbToolText,
  parseMaxkbText,
} from "../../src/mcp/maxkb-resource"

const root = "../../docs/plans/maxkb-manual-validation"

describe("maxkb resource parsing", () => {
  test("parses dataset payload fixture", async () => {
    const out = MaxkbDatasetPayload.parse(await Bun.file(`${root}/05-datasets-payload.json`).json())

    expect(out.datasets[0]?.id).toBeTruthy()
    expect(out.datasets[0]?.name).toBeTruthy()
    expect(out.truncated).toBe(false)
  })

  test("parses document payload fixture", async () => {
    const out = MaxkbDocumentPayload.parse(await Bun.file(`${root}/07-documents-payload.json`).json())

    expect(out.dataset.id).toBeTruthy()
    expect(out.documents[0]?.id).toBeTruthy()
    expect(out.documents[0]?.name).toBeTruthy()
  })

  test("parses paragraph payload fixture", async () => {
    const out = MaxkbParagraphPayload.parse(await Bun.file(`${root}/09-paragraphs-payload.json`).json())

    expect(out.document.id).toBeTruthy()
    expect(out.paragraphs[0]?.id).toBeTruthy()
    expect(out.paragraphs[0]?.content.length).toBeGreaterThan(0)
  })

  test("extracts text from mcp read resource result", () => {
    const text = extractMaxkbText({
      contents: [
        {
          uri: "maxkb://datasets",
          mimeType: "application/json",
          text: "{\"datasets\":[],\"truncated\":false}",
        },
      ],
    })

    expect(text).toBe("{\"datasets\":[],\"truncated\":false}")
  })

  test("rejects missing text content", () => {
    expect(() => extractMaxkbText({ contents: [] })).toThrow("MaxKB resource response missing contents[0].text")
  })

  test("extracts text from mcp tool result", () => {
    const text = extractMaxkbToolText({
      content: [
        {
          type: "text",
          text: "{\"page\":{\"total\":1}}",
        },
      ],
    })

    expect(text).toBe("{\"page\":{\"total\":1}}")
  })

  test("rejects invalid json text", () => {
    expect(() => parseMaxkbText("{", MaxkbDatasetPayload)).toThrow("Invalid MaxKB resource JSON")
  })

  test("rejects schema mismatch", () => {
    expect(() => parseMaxkbText("{\"datasets\":[]}", MaxkbDatasetPayload)).toThrow(
      "Invalid MaxKB resource payload at truncated",
    )
  })

  test("parses category tree payload", () => {
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
          sort_order: 0,
          is_default: false,
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

  test("parses paged document tool payload", () => {
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

  test("parses paged paragraph tool payload", () => {
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
})
