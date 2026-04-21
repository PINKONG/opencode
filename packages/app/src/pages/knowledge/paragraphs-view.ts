export function paragraphLoadMoreVisible(input: {
  more: boolean
  search: string
  loading: boolean
}) {
  return input.more && !input.loading && !input.search.trim()
}

export function paragraphHasContent(input: {
  content: string
}) {
  return !!input.content.trim()
}

export const paragraphDialog = {
  body: "max-h-[70vh] overflow-y-auto px-5 pb-5 whitespace-pre-wrap break-words text-14-regular leading-6 text-text-strong",
}
