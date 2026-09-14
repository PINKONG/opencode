import { base64Encode } from "@opencode-ai/core/util/encode"

export function knowledgeDirectory(input: { directory?: string; projects: { worktree: string }[] }) {
  const directory = input.directory?.trim()
  if (directory) return directory
  return input.projects[0]?.worktree.trim() || undefined
}

export function knowledgeHref(dir: string, dataset?: string, document?: string, client?: string) {
  const slug = base64Encode(dir)
  const query = client ? `?client=${encodeURIComponent(client)}` : ""
  if (!dataset) return `/${slug}/knowledge${query}`
  if (!document) return `/${slug}/knowledge/${dataset}${query}`
  return `/${slug}/knowledge/${dataset}/${document}${query}`
}

export function knowledgeV2Href(dir: string, dataset?: string, document?: string, client?: string) {
  const slug = base64Encode(dir)
  const query = client ? `?client=${encodeURIComponent(client)}` : ""
  if (!dataset) return `/knowledge/${slug}${query}`
  if (!document) return `/knowledge/${slug}/${dataset}${query}`
  return `/knowledge/${slug}/${dataset}/${document}${query}`
}

export function knowledgeParentHref(dir: string, dataset?: string, document?: string, client?: string) {
  if (document) return knowledgeHref(dir, dataset, undefined, client)
  return knowledgeHref(dir, undefined, undefined, client)
}

export function knowledgeV2ParentHref(dir: string, dataset?: string, document?: string, client?: string) {
  if (document) return knowledgeV2Href(dir, dataset, undefined, client)
  return knowledgeV2Href(dir, undefined, undefined, client)
}

export function knowledgeExitHref(dir: string) {
  return `/${base64Encode(dir)}/session`
}

export function knowledgeV2ExitHref() {
  return "/"
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
      dataset: undefined,
      document: undefined,
    },
    ...(input.dataset
      ? [
          {
            label: input.datasetName || input.dataset,
            href: knowledgeHref(input.dir, input.dataset, undefined, input.client),
            dataset: input.dataset,
            document: undefined,
          },
        ]
      : []),
    ...(input.document
      ? [
          {
            label: input.documentLabel,
            href: knowledgeHref(input.dir, input.dataset, input.document, input.client),
            dataset: input.dataset,
            document: input.document,
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
