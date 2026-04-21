type DocApi = {
  document: () => Promise<{
    dataset: { id: string; name: string; desc?: string }
    document: {
      id: string
      dataset_id: string
      name: string
      paragraph_count?: number
      char_length?: number
      hit_handling_method?: string
      is_active?: boolean
    }
  }>
}

type ParagraphApi = {
  paragraphs: (input: {
    dataset: string
    document: string
    limit: number
    offset: number
  }) => Promise<{
    dataset: { id: string; name: string; desc?: string }
    document: { id: string; name: string; paragraph_count?: number }
    page: {
      limit: number
      offset: number
      total: number
      has_more: boolean
      records: Array<{
        id: string
        document_id: string
        dataset_id: string
        title: string
        content: string
        is_active?: boolean
      }>
    }
  }>
}

export async function loadDocument(api: DocApi) {
  return api.document()
}

export async function loadParagraphs(
  api: ParagraphApi,
  input: {
    dataset: string
    document: string
    limit: number
    offset: number
  },
) {
  return api.paragraphs(input)
}
