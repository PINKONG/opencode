import { describe, expect, test } from "bun:test"
import { paragraphLoadMoreVisible } from "./paragraphs-view"

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
})
