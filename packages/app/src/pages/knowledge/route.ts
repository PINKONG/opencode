import { base64Encode } from "@opencode-ai/util/encode"

export function knowledgeHref(dir: string, dataset?: string, document?: string, client?: string) {
  const slug = base64Encode(dir)
  const query = client ? `?client=${encodeURIComponent(client)}` : ""
  if (!dataset) return `/${slug}/knowledge${query}`
  if (!document) return `/${slug}/knowledge/${dataset}${query}`
  return `/${slug}/knowledge/${dataset}/${document}${query}`
}

export function knowledgeParentHref(dir: string, dataset?: string, document?: string, client?: string) {
  if (document) return knowledgeHref(dir, dataset, undefined, client)
  return knowledgeHref(dir, undefined, undefined, client)
}

export function knowledgeExitHref(dir: string) {
  return `/${base64Encode(dir)}/session`
}

export function knowledgeCrumbs(input: {
  root: string
  dataset?: string
  datasetName?: string
  document?: string
  documentLabel: string
  dir: string
  client?: string
}) {
  return [
    {
      label: input.root,
      href: knowledgeHref(input.dir, undefined, undefined, input.client),
    },
    ...(input.dataset
      ? [
          {
            label: input.datasetName || input.dataset,
            href: knowledgeHref(input.dir, input.dataset, undefined, input.client),
          },
        ]
      : []),
    ...(input.document
      ? [
          {
            label: input.documentLabel,
            href: knowledgeHref(input.dir, input.dataset, input.document, input.client),
          },
        ]
      : []),
  ]
}

export function knowledgeActive(path: string) {
  return /\/knowledge(?:\/|$)/.test(path)
}

export function knowledgeVisible(input: { loading: boolean; clients: string[] }) {
  return !input.loading && input.clients.length > 0
}

export function knowledgeRootOnClientChange(dir: string) {
  return knowledgeHref(dir)
}
