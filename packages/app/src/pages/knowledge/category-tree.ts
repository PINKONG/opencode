export const allValue = "__all__"
export const uncategorizedValue = "uncategorized"

type Raw = {
  id: string
  name: string
  document_count?: number
  children: Raw[]
}

export type CategoryNode = {
  id: string
  name: string
  count: number
  value: string
  children: CategoryNode[]
}

function mapNode(item: Raw): CategoryNode {
  return {
    id: item.id,
    name: item.name,
    count: item.document_count ?? 0,
    value: item.id,
    children: item.children.map(mapNode),
  }
}

export function knowledgeCategoryValue(value?: string | null) {
  if (!value) return allValue
  return value
}

export function buildCategoryTree(input: {
  all: number
  uncategorized: number
  categories: Raw[]
}) {
  return [
    {
      id: allValue,
      name: "All documents",
      count: input.all,
      value: allValue,
      children: [],
    },
    {
      id: uncategorizedValue,
      name: "Uncategorized",
      count: input.uncategorized,
      value: uncategorizedValue,
      children: [],
    },
    ...input.categories.map(mapNode),
  ]
}

export function filterCategoryTree(list: CategoryNode[], search: string) {
  const value = search.trim().toLowerCase()
  if (!value) return list

  const walk = (item: CategoryNode): CategoryNode | undefined => {
    const children = item.children.map(walk).filter((x): x is CategoryNode => !!x)
    if (item.name.toLowerCase().includes(value)) return { ...item, children }
    if (children.length > 0) return { ...item, children }
    return
  }

  return list.map(walk).filter((x): x is CategoryNode => !!x)
}
