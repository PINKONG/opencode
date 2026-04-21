type Item = {
  id: string
  dataset_id: string
  name: string
  char_length?: number
  paragraph_count?: number
}

type State = {
  page: number
  total: number
  records: Item[]
}

type Page = {
  current_page: number
  total: number
  records: Item[]
}

export function resetDocumentList(): State {
  return {
    page: 0,
    total: 0,
    records: [],
  }
}

export function appendDocumentPage(state: State, page: Page): State {
  return {
    page: page.current_page,
    total: page.total,
    records: [...state.records, ...page.records],
  }
}

export function canLoadMoreDocuments(input: {
  loading: boolean
  size: number
  total: number
}) {
  return !input.loading && input.size < input.total
}

export function shouldAppendDocumentPage(
  state: State,
  page: Page,
) {
  return page.current_page > state.page
}

export function documentLoading(input: {
  pending: boolean
  fetching: boolean
}) {
  return input.pending || input.fetching
}
