import { describe, expect, test } from "bun:test"
import {
  appendDocumentPage,
  canLoadMoreDocuments,
  documentLoading,
  resetDocumentList,
  shouldAppendDocumentPage,
} from "./document-list"

describe("knowledge document list helpers", () => {
  test("appends paged records in order", () => {
    const state = appendDocumentPage(
      {
        page: 1,
        total: 3,
        records: [
          { id: "a", dataset_id: "d", name: "A" },
          { id: "b", dataset_id: "d", name: "B" },
        ],
      },
      {
        current_page: 2,
        total: 3,
        records: [{ id: "c", dataset_id: "d", name: "C" }],
      },
    )

    expect(state.page).toBe(2)
    expect(state.total).toBe(3)
    expect(state.records.map((item) => item.id)).toEqual(["a", "b", "c"])
  })

  test("resetDocumentList resets state when category changes", () => {
    const out = resetDocumentList()

    expect(out).toEqual({
      page: 0,
      total: 0,
      records: [],
    })
  })

  test("canLoadMoreDocuments only stays true when more records exist", () => {
    expect(canLoadMoreDocuments({ loading: true, size: 2, total: 3 })).toBe(false)
    expect(canLoadMoreDocuments({ loading: false, size: 2, total: 3 })).toBe(true)
    expect(canLoadMoreDocuments({ loading: false, size: 3, total: 3 })).toBe(false)
  })

  test("treats background fetching as loading for load-more guard", () => {
    expect(documentLoading({ pending: false, fetching: true })).toBe(true)
    expect(documentLoading({ pending: true, fetching: false })).toBe(true)
    expect(documentLoading({ pending: false, fetching: false })).toBe(false)
  })

  test("prevents duplicate append when same page refetches", () => {
    const state = {
      page: 1,
      total: 1,
      records: [{ id: "a", dataset_id: "d", name: "A" }],
    }

    expect(shouldAppendDocumentPage(state, { current_page: 1, total: 1, records: [] })).toBe(false)
    expect(shouldAppendDocumentPage(state, { current_page: 2, total: 1, records: [] })).toBe(true)
  })
})
