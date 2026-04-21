import { describe, expect, test } from "bun:test"
import { MaxkbDatasetPayload, MaxkbDocumentPagePayload, MaxkbParagraphPagePayload } from "@/data/maxkb"
import { appendDocumentPage, canLoadMoreDocuments, resetDocumentList } from "./document-list"
import {
  appendParagraphPage,
  canLoadMoreParagraphs,
  filterParagraphs,
  paragraphLabel,
  paragraphPreview,
  resetParagraphList,
} from "./paragraph-list"

const fixture = (name: string) =>
  Bun.file(new URL(`../../../../../docs/plans/maxkb-manual-validation/${name}`, import.meta.url))

describe("knowledge smoke", () => {
  test("parses dataset fixture and builds document list state", async () => {
    const data = MaxkbDatasetPayload.parse(await fixture("05-datasets-payload.json").json())
    const docs = (await fixture("07-documents-payload.json").json()) as {
      dataset: unknown
      documents: Array<unknown>
    }

    const page = MaxkbDocumentPagePayload.parse({
      dataset: docs.dataset,
      filters: {
        category_id: null,
        category_name: null,
        name: null,
      },
      page: {
        current_page: 1,
        page_size: 20,
        total: docs.documents.length,
        records: docs.documents,
      },
    })

    const list = appendDocumentPage(resetDocumentList(), page.page)

    expect(data.datasets[0]?.id).toBe(page.dataset.id)
    expect(list.records[0]?.dataset_id).toBe(page.dataset.id)
    expect(canLoadMoreDocuments({ loading: false, size: list.records.length, total: list.total })).toBe(false)
  })

  test("parses paragraph fixture and runs list helpers on first page", async () => {
    const data = (await fixture("09-paragraphs-payload.json").json()) as {
      dataset: unknown
      document: unknown
      paragraphs: Array<unknown>
    }
    const rows = data.paragraphs.slice(0, 20)
    const page = MaxkbParagraphPagePayload.parse({
      dataset: data.dataset,
      document: data.document,
      page: {
        limit: 20,
        offset: 0,
        total: data.paragraphs.length,
        has_more: data.paragraphs.length > 20,
        records: rows,
      },
    })

    const list = appendParagraphPage(resetParagraphList(), page.page)
    const hit = filterParagraphs(list.records, "索引页")
    const text = paragraphPreview(list.records[0]?.content ?? "", 120)
    const title = paragraphLabel({ title: list.records[0]?.title }, 1)

    expect(hit.length).toBeGreaterThan(0)
    expect(text.length).toBeLessThanOrEqual(123)
    expect(title).toBeTruthy()
    expect(canLoadMoreParagraphs({ loading: false, size: list.records.length, total: list.total })).toBe(true)
  })
})
