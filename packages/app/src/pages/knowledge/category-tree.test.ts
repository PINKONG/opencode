import { describe, expect, test } from "bun:test"
import { buildCategoryTree, filterCategoryTree, knowledgeCategoryValue, uncategorizedValue } from "./category-tree"

describe("knowledge category tree helpers", () => {
  test("prepends virtual all and uncategorized nodes", () => {
    const out = buildCategoryTree({
      all: 7,
      uncategorized: 1,
      categories: [
        {
          id: "category-1",
          name: "行业标准",
          document_count: 0,
          children: [],
        },
      ],
    })

    expect(out[0]).toEqual({
      id: "__all__",
      name: "All documents",
      count: 7,
      value: "__all__",
      children: [],
    })
    expect(out[1]).toEqual({
      id: uncategorizedValue,
      name: "Uncategorized",
      count: 1,
      value: uncategorizedValue,
      children: [],
    })
    expect(out[2]?.children).toEqual([])
  })

  test("builds recursive value tree from categories", () => {
    const out = buildCategoryTree({
      all: 3,
      uncategorized: 0,
      categories: [
        {
          id: "root",
          name: "需求说明书",
          document_count: 2,
          children: [
            {
              id: "leaf",
              name: "详细设计",
              document_count: 1,
              children: [],
            },
          ],
        },
      ],
    })

    expect(out[2]).toEqual({
      id: "root",
      name: "需求说明书",
      count: 2,
      value: "root",
      children: [
        {
          id: "leaf",
          name: "详细设计",
          count: 1,
          value: "leaf",
          children: [],
        },
      ],
    })
  })

  test("filters tree while keeping parent path", () => {
    const out = filterCategoryTree(
      [
        {
          id: "__all__",
          name: "All documents",
          count: 7,
          value: "__all__",
          children: [],
        },
        {
          id: "root",
          name: "需求说明书",
          count: 2,
          value: "root",
          children: [
            {
              id: "leaf",
              name: "详细设计",
              count: 1,
              value: "leaf",
              children: [],
            },
          ],
        },
      ],
      "详细",
    )

    expect(out).toEqual([
      {
        id: "root",
        name: "需求说明书",
        count: 2,
        value: "root",
        children: [
          {
            id: "leaf",
            name: "详细设计",
            count: 1,
            value: "leaf",
            children: [],
          },
        ],
      },
    ])
  })

  test("maps nullable category ids to sentinel values", () => {
    expect(knowledgeCategoryValue(null)).toBe("__all__")
    expect(knowledgeCategoryValue(undefined)).toBe("__all__")
    expect(knowledgeCategoryValue("uncategorized")).toBe("uncategorized")
    expect(knowledgeCategoryValue("category-1")).toBe("category-1")
  })
})
