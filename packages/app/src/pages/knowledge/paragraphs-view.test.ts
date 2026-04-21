import { describe, expect, test } from "bun:test"
import {
  paragraphDialog,
  paragraphHasContent,
  paragraphLoadMoreVisible,
} from "./paragraphs-view"

describe("knowledge paragraph view helpers", () => {
  test("hides load-more when search term is active", () => {
    expect(paragraphLoadMoreVisible({ more: true, search: "key", loading: false })).toBe(false)
    expect(paragraphLoadMoreVisible({ more: true, search: "  key  ", loading: false })).toBe(false)
    expect(paragraphLoadMoreVisible({ more: true, search: "", loading: false })).toBe(true)
    expect(paragraphLoadMoreVisible({ more: true, search: "   ", loading: false })).toBe(true)
    expect(paragraphLoadMoreVisible({ more: false, search: "", loading: false })).toBe(false)
  })

  test("hides load-more while fetching is active", () => {
    expect(paragraphLoadMoreVisible({ more: true, search: "", loading: true })).toBe(false)
  })

  test("treats non-empty paragraph content as previewable", () => {
    expect(paragraphHasContent({ content: "正文" })).toBe(true)
    expect(paragraphHasContent({ content: "   " })).toBe(false)
  })

  test("aligns paragraph dialog body with the dialog title area", () => {
    expect(paragraphDialog.body).toContain("px-5")
    expect(paragraphDialog.body).toContain("pb-5")
    expect(paragraphDialog.body).toContain("overflow-y-auto")
  })
})
