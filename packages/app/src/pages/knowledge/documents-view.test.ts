import { describe, expect, test } from "bun:test"
import { documentView } from "./documents-view"

describe("knowledge document view classes", () => {
  test("constrains the document page so lists scroll inside the panes", () => {
    expect(documentView.root).toContain("overflow-hidden")
    expect(documentView.pane).toContain("flex")
    expect(documentView.pane).toContain("flex-col")
    expect(documentView.pane).toContain("overflow-hidden")
    expect(documentView.documents).toContain("flex-1")
    expect(documentView.documents).toContain("min-h-0")
    expect(documentView.documents).toContain("overflow-y-auto")
    expect(documentView.documents).toContain("pr-1")
    expect(documentView.category).toContain("flex-1")
    expect(documentView.category).toContain("min-h-0")
    expect(documentView.category).toContain("overflow-y-auto")
    expect(documentView.category).toContain("pr-1")
  })
})
