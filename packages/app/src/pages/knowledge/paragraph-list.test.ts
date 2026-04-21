import { describe, expect, test } from "bun:test"
import {
  appendParagraphPage,
  canLoadMoreParagraphs,
  filterParagraphs,
  paragraphLabel,
  paragraphPreview,
  resetParagraphList,
  shouldAppendParagraphPage,
} from "./paragraph-list"

describe("knowledge paragraph list helpers", () => {
  test("appends paged paragraph records in order", () => {
    const state = appendParagraphPage(
      {
        offset: 20,
        total: 40,
        records: [
          { id: "p1", title: "One", content: "alpha", document_id: "doc", dataset_id: "data" },
          { id: "p2", title: "Two", content: "beta", document_id: "doc", dataset_id: "data" },
        ],
      },
      {
        offset: 40,
        total: 40,
        records: [{ id: "p3", title: "Three", content: "gamma", document_id: "doc", dataset_id: "data" }],
      },
    )

    expect(state.offset).toBe(40)
    expect(state.total).toBe(40)
    expect(state.records.map((item) => item.id)).toEqual(["p1", "p2", "p3"])
  })

  test("resetParagraphList clears paging state", () => {
    expect(resetParagraphList()).toEqual({
      offset: 0,
      total: 0,
      records: [],
    })
  })

  test("canLoadMoreParagraphs only stays true when more records exist", () => {
    expect(canLoadMoreParagraphs({ loading: true, size: 1, total: 2 })).toBe(false)
    expect(canLoadMoreParagraphs({ loading: false, size: 1, total: 2 })).toBe(true)
    expect(canLoadMoreParagraphs({ loading: false, size: 2, total: 2 })).toBe(false)
  })

  test("filters loaded paragraph records by title and content", () => {
    const out = filterParagraphs(
      [
        { id: "p1", title: "Install", content: "Quick start guide", document_id: "doc", dataset_id: "data" },
        { id: "p2", title: "", content: "Database migration", document_id: "doc", dataset_id: "data" },
      ],
      "migr",
    )

    expect(out.map((item) => item.id)).toEqual(["p2"])
  })

  test("builds preview text with truncation", () => {
    const out = paragraphPreview("  one\n two  ", 6)

    expect(out).toBe("one tw...")
  })

  test("builds a fallback label when title is missing", () => {
    expect(paragraphLabel({ title: "Heading" }, 3)).toBe("Heading")
    expect(paragraphLabel({ title: "" }, 3)).toBe("Paragraph 3")
  })

  test("prevents duplicate append when same offset refetches", () => {
    const state = {
      offset: 20,
      total: 40,
      records: [{ id: "p1", title: "One", content: "alpha", document_id: "doc", dataset_id: "data" }],
    }

    expect(shouldAppendParagraphPage(state, { offset: 0, total: 40, records: [] })).toBe(false)
    expect(shouldAppendParagraphPage(state, { offset: 20, total: 40, records: [] })).toBe(true)
  })
})
