import {
  MaxkbCategoryPayload,
  MaxkbDatasetPayload,
  MaxkbDocumentDetailPayload,
  MaxkbDocumentPagePayload,
  MaxkbParagraphPagePayload,
  extractMaxkbResourceText,
  extractMaxkbToolText,
  parseMaxkbText,
} from "./maxkb"
import z from "zod"

type Sdk = {
  experimental: {
    resource: {
      read(input: {
        directory?: string
        workspace?: string
        client: string
        uri: string
      }): Promise<{ data?: unknown }>
    }
    tool: {
      call(input: {
        directory?: string
        workspace?: string
        client?: string
        name?: "list_dataset_documents" | "get_document_paragraphs"
        arguments?: Record<string, unknown>
      }): Promise<{ data?: unknown }>
    }
  }
}

export function createKnowledgeApi(sdk: Sdk, client: string) {
  const read = async <T>(uri: string, schema: z.ZodType<T>) => {
    const out = await sdk.experimental.resource.read({
      client,
      uri,
    })
    return parseMaxkbText(
      extractMaxkbResourceText((out as { data?: unknown }).data),
      schema,
    )
  }
  const tool = async <T>(
    name: "list_dataset_documents" | "get_document_paragraphs",
    args: Record<string, unknown>,
    schema: z.ZodType<T>,
  ) => {
    const out = await sdk.experimental.tool.call({
      client,
      name,
      arguments: args,
    })
    return parseMaxkbText(
      extractMaxkbToolText((out as { data?: unknown }).data),
      schema,
    )
  }

  return {
    datasets() {
      return read("maxkb://datasets", MaxkbDatasetPayload)
    },
    categories(dataset: string) {
      return read(`maxkb://datasets/${dataset}/categories`, MaxkbCategoryPayload)
    },
    document(dataset: string, document: string) {
      return read(`maxkb://datasets/${dataset}/documents/${document}`, MaxkbDocumentDetailPayload)
    },
    documents(input: {
      dataset: string
      category?: string | null
      page: number
      size: number
      name?: string
    }) {
      return tool(
        "list_dataset_documents",
        {
          dataset_id: input.dataset,
          ...(input.category ? { category_id: input.category } : {}),
          current_page: input.page,
          page_size: input.size,
          ...(input.name ? { name: input.name } : {}),
        },
        MaxkbDocumentPagePayload,
      )
    },
    paragraphs(input: {
      dataset: string
      document: string
      limit: number
      offset: number
    }) {
      return tool(
        "get_document_paragraphs",
        {
          dataset_id: input.dataset,
          document_id: input.document,
          limit: input.limit,
          offset: input.offset,
        },
        MaxkbParagraphPagePayload,
      )
    },
  }
}
