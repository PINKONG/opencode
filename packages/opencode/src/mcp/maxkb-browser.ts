import type { MaxkbDataset, MaxkbDocument, MaxkbParagraph } from "./maxkb-resource"

type Resource = {
  client: string
  uri: string
  name?: string
}

export const maxkbAll = "__all__"

export function findMaxkbServers(resources: Record<string, Resource>) {
  return Array.from(
    new Set(
      Object.values(resources)
        // MaxKB currently exposes `maxkb://datasets` from resources/list.
        // Keep query-suffixed variants discoverable without matching subpaths.
        .filter((item) => item.uri === "maxkb://datasets" || item.uri.startsWith("maxkb://datasets?"))
        .map((item) => item.client),
    ),
  ).sort()
}

/** @deprecated Prefer categories + list_dataset_documents for paged browsing. */
export function maxkbDocumentUri(id: string) {
  return `maxkb://datasets/${id}/documents`
}

export function maxkbCategoriesUri(id: string) {
  return `maxkb://datasets/${id}/categories`
}

export function maxkbDocumentDetailUri(dataset: string, document: string) {
  return `maxkb://datasets/${dataset}/documents/${document}`
}

/** @deprecated Prefer get_document_paragraphs for paged browsing. */
export function maxkbParagraphUri(dataset: string, document: string) {
  return `maxkb://datasets/${dataset}/documents/${document}/paragraphs`
}

export function maxkbMore(size: number, total: number) {
  return `Load more (${size}/${total})`
}

function shorten(text: string, size = 120) {
  const value = text.replace(/\s+/g, " ").trim()
  if (value.length <= size) return value
  return value.slice(0, Math.max(0, size - 1)).trimEnd() + "…"
}

function date(text?: string) {
  return text?.slice(0, 10)
}

export function maxkbDatasetText(item: MaxkbDataset) {
  return [item.desc, typeof item.document_count === "number" ? `${item.document_count} documents` : undefined]
    .filter(Boolean)
    .join(" | ")
}

export function maxkbDocumentText(item: MaxkbDocument) {
  return [item.status, typeof item.char_length === "number" ? `${item.char_length} chars` : undefined, date(item.update_time)]
    .filter(Boolean)
    .join(" | ")
}

export function maxkbParagraphText(item: MaxkbParagraph) {
  return [
    shorten(item.content),
    item.status,
    typeof item.hit_num === "number" ? `hits: ${item.hit_num}` : undefined,
    item.is_active === false ? "inactive" : undefined,
  ]
    .filter(Boolean)
    .join(" | ")
}
