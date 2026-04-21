import type { McpResource } from "@opencode-ai/sdk/v2/client"
import z from "zod"

export class MaxkbToolError extends Error {
  constructor(message: string) {
    super(message)
    this.name = "MaxkbToolError"
  }
}

export const MaxkbDatasetPayload = z
  .object({
    datasets: z.array(
      z
        .object({
          id: z.string(),
          name: z.string(),
          desc: z.string().optional(),
          type: z.string().optional(),
          type_label: z.string().optional(),
          document_count: z.number().optional(),
          char_length: z.number().optional(),
          application_mapping_count: z.number().optional(),
          username: z.string().optional(),
          create_time: z.string().optional(),
          update_time: z.string().optional(),
          mcp_exposed: z.boolean().optional(),
        })
        .passthrough(),
    ),
    truncated: z.boolean(),
  })
  .passthrough()

const MaxkbDatasetInfo = z
  .object({
    id: z.string(),
    name: z.string(),
    desc: z.string().optional(),
  })
  .passthrough()

const MaxkbDocumentInfo = z
  .object({
    id: z.string(),
    dataset_id: z.string(),
    category_id: z.string().nullable().optional(),
    category_name: z.string().nullable().optional(),
    name: z.string(),
    char_length: z.number().optional(),
    paragraph_count: z.number().optional(),
    status: z.string().optional(),
    is_active: z.boolean().optional(),
    hit_handling_method: z.string().optional(),
    directly_return_similarity: z.number().optional(),
    create_time: z.string().optional(),
    update_time: z.string().optional(),
  })
  .passthrough()

export type Category = {
  id: string
  name: string
  parent_id?: string | null
  sort_order?: number
  is_default?: boolean
  document_count?: number
  children: Category[]
}

const MaxkbCategory: z.ZodType<Category> = z
  .object({
    id: z.string(),
    name: z.string(),
    parent_id: z.string().nullable().optional(),
    sort_order: z.number().optional(),
    is_default: z.boolean().optional(),
    document_count: z.number().optional(),
    children: z.lazy(() => z.array(MaxkbCategory)),
  })
  .passthrough()

export const MaxkbCategoryPayload = z
  .object({
    dataset: MaxkbDatasetInfo,
    statistics: z
      .object({
        all_documents: z.number(),
        uncategorized: z.number(),
      })
      .passthrough(),
    categories: z.array(MaxkbCategory),
  })
  .passthrough()

export const MaxkbDocumentDetailPayload = z
  .object({
    dataset: MaxkbDatasetInfo,
    document: MaxkbDocumentInfo,
  })
  .passthrough()

export const MaxkbDocumentPagePayload = z
  .object({
    dataset: MaxkbDatasetInfo,
    filters: z
      .object({
        category_id: z.string().nullable().optional(),
        category_name: z.string().nullable().optional(),
        name: z.string().nullable().optional(),
      })
      .passthrough(),
    page: z
      .object({
        current_page: z.number(),
        page_size: z.number(),
        total: z.number(),
        records: z.array(MaxkbDocumentInfo),
      })
      .passthrough(),
  })
  .passthrough()

const MaxkbParagraphInfo = z
  .object({
    id: z.string(),
    document_id: z.string(),
    dataset_id: z.string(),
    title: z.string(),
    content: z.string(),
    status: z.string().optional(),
    hit_num: z.number().optional(),
    is_active: z.boolean().optional(),
    create_time: z.string().optional(),
    update_time: z.string().optional(),
  })
  .passthrough()

export const MaxkbParagraphPagePayload = z
  .object({
    dataset: MaxkbDatasetInfo,
    document: z
      .object({
        id: z.string(),
        name: z.string(),
        paragraph_count: z.number().optional(),
      })
      .passthrough(),
    page: z
      .object({
        limit: z.number(),
        offset: z.number(),
        total: z.number(),
        has_more: z.boolean(),
        records: z.array(MaxkbParagraphInfo),
      })
      .passthrough(),
    paragraphs: z.array(MaxkbParagraphInfo).optional(),
    limit: z.number().optional(),
    offset: z.number().optional(),
    dataset_id: z.string().optional(),
    document_id: z.string().optional(),
  })
  .passthrough()

export function findMaxkbClients(resources: Record<string, McpResource>) {
  return Array.from(
    new Set(
      Object.values(resources)
        .filter((item) => item.uri === "maxkb://datasets" || item.uri.startsWith("maxkb://datasets?"))
        .map((item) => item.client),
    ),
  ).sort()
}

export function extractMaxkbResourceText(result: unknown) {
  const text = (result as { contents?: Array<{ text?: unknown }> })?.contents?.[0]?.text
  if (typeof text !== "string") throw new Error("MaxKB resource response missing contents[0].text")
  return text
}

export function extractMaxkbToolText(result: unknown) {
  const err = (result as { isError?: unknown })?.isError
  if (err === true) {
    const msg = (result as { content?: Array<{ text?: unknown }> })?.content?.[0]?.text
    if (typeof msg === "string" && msg.trim()) throw new MaxkbToolError(msg)
    throw new MaxkbToolError("MaxKB tool call failed")
  }
  const text = (result as { content?: Array<{ text?: unknown }> })?.content?.[0]?.text
  if (typeof text !== "string") throw new Error("MaxKB tool response missing content[0].text")
  return text
}

export function shouldRetryMaxkb(input: {
  count: number
  err: unknown
  max?: number
}) {
  if (input.err instanceof MaxkbToolError) return false
  return input.count < (input.max ?? 3)
}

export function parseMaxkbText<T>(text: string, schema: z.ZodType<T>) {
  let json: unknown
  try {
    json = JSON.parse(text)
  } catch (err) {
    throw new Error("Invalid MaxKB resource JSON", { cause: err })
  }

  const out = schema.safeParse(json)
  if (!out.success) {
    const issue = out.error.issues[0]
    const path = issue?.path.length ? ` at ${issue.path.join(".")}` : ""
    const msg = issue?.message ? `: ${issue.message}` : ""
    throw new Error(`Invalid MaxKB resource payload${path}${msg}`, { cause: out.error })
  }
  return out.data
}
