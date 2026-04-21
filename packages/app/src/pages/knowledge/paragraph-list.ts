type Item = {
  id: string
  document_id: string
  dataset_id: string
  title: string
  content: string
  status?: string
  is_active?: boolean
}

type State = {
  offset: number
  total: number
  records: Item[]
}

type Page = {
  offset: number
  total: number
  records: Item[]
}

export function resetParagraphList(): State {
  return {
    offset: 0,
    total: 0,
    records: [],
  }
}

export function appendParagraphPage(state: State, page: Page): State {
  return {
    offset: page.offset,
    total: page.total,
    records: [...state.records, ...page.records],
  }
}

export function canLoadMoreParagraphs(input: {
  loading: boolean
  size: number
  total: number
}) {
  return !input.loading && input.size < input.total
}

export function filterParagraphs(list: Item[], search: string) {
  const value = search.trim().toLowerCase()
  if (!value) return list
  return list.filter((item) => {
    const title = item.title.toLowerCase()
    const content = item.content.toLowerCase()
    return title.includes(value) || content.includes(value)
  })
}

export function paragraphPreview(value: string, max = 140) {
  const text = value.replace(/\s+/g, " ").trim()
  if (text.length <= max) return text
  return `${text.slice(0, max)}...`
}

export function paragraphLabel(item: { title?: string }, index: number) {
  if (item.title?.trim()) return item.title.trim()
  return `Paragraph ${index}`
}

export function shouldAppendParagraphPage(
  state: State,
  page: Page,
) {
  return page.offset >= state.offset
}
