export function paragraphLoadMoreVisible(input: {
  more: boolean
  search: string
  loading: boolean
}) {
  return input.more && !input.loading && !input.search.trim()
}
