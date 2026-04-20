import { describe, expect, test } from "bun:test"
import {
  findMaxkbServers,
  maxkbAll,
  maxkbCategoriesUri,
  maxkbDatasetText,
  maxkbDocumentDetailUri,
  maxkbDocumentText,
  maxkbDocumentUri,
  maxkbMore,
  maxkbParagraphText,
  maxkbParagraphUri,
} from "../../src/mcp/maxkb-browser"

describe("maxkb browser helpers", () => {
  test("finds servers exposing maxkb datasets", () => {
    const out = findMaxkbServers({
      "alpha:datasets": {
        client: "alpha",
        uri: "maxkb://datasets",
        name: "datasets",
      },
      "beta:other": {
        client: "beta",
        uri: "file:///tmp/a.txt",
        name: "other",
      },
      "alpha:duplicate": {
        client: "alpha",
        uri: "maxkb://datasets",
        name: "datasets",
      },
    })

    expect(out).toEqual(["alpha"])
  })

  test("finds servers exposing maxkb datasets with query suffix", () => {
    const out = findMaxkbServers({
      "alpha:datasets": {
        client: "alpha",
        uri: "maxkb://datasets?view=full",
        name: "datasets",
      },
      "beta:other": {
        client: "beta",
        uri: "maxkb://datasets/documents",
        name: "other",
      },
    })

    expect(out).toEqual(["alpha"])
  })

  test("builds parameterized resource uris", () => {
    expect(maxkbCategoriesUri("dataset-1")).toBe("maxkb://datasets/dataset-1/categories")
    expect(maxkbDocumentUri("dataset-1")).toBe("maxkb://datasets/dataset-1/documents")
    expect(maxkbDocumentDetailUri("dataset-1", "document-1")).toBe(
      "maxkb://datasets/dataset-1/documents/document-1",
    )
    expect(maxkbParagraphUri("dataset-1", "document-1")).toBe(
      "maxkb://datasets/dataset-1/documents/document-1/paragraphs",
    )
  })

  test("exports stable category sentinel and load-more label", () => {
    expect(maxkbAll).toBe("__all__")
    expect(maxkbMore(20, 338)).toBe("Load more (20/338)")
  })

  test("formats dataset text for browsing", () => {
    expect(
      maxkbDatasetText({
        id: "dataset-1",
        name: "Dataset",
        desc: "Knowledge base",
        document_count: 2,
      }),
    ).toBe("Knowledge base | 2 documents")
  })

  test("formats document text for browsing", () => {
    expect(
      maxkbDocumentText({
        id: "document-1",
        dataset_id: "dataset-1",
        name: "doc.md",
        char_length: 12345,
        status: "ready",
        update_time: "2026-04-20T09:30:00Z",
      }),
    ).toBe("ready | 12345 chars | 2026-04-20")
  })

  test("formats paragraph text for browsing", () => {
    const out = maxkbParagraphText({
      id: "paragraph-1",
      dataset_id: "dataset-1",
      document_id: "document-1",
      title: "Overview",
      content: "  First line.\nSecond line.  ".repeat(40),
      status: "ready",
      hit_num: 3,
      is_active: false,
    })

    expect(out).toContain("ready | hits: 3 | inactive")
    expect(out.length).toBeLessThanOrEqual(160)
  })
})
