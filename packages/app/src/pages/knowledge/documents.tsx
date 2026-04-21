import { createEffect, createMemo, createSignal, For, Show, on } from "solid-js"
import { A } from "@solidjs/router"
import { createQuery } from "@tanstack/solid-query"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { createKnowledgeApi } from "@/data/knowledge-api"
import { shouldRetryMaxkb } from "@/data/maxkb"
import { allValue, buildCategoryTree, categoryLabel, filterCategoryTree, knowledgeCategoryValue } from "./category-tree"
import {
  appendDocumentPage,
  canLoadMoreDocuments,
  documentLoading,
  resetDocumentList,
  shouldAppendDocumentPage,
} from "./document-list"
import { documentView } from "./documents-view"
import { knowledgeHref } from "./route"

const retry = (count: number, err: unknown) => shouldRetryMaxkb({ count, err })

export function DocumentsPage(props: { client: string; dataset: string }) {
  const language = useLanguage()
  const sdk = useSDK()
  const [search, setSearch] = createSignal("")
  const [selected, setSelected] = createSignal<string>(knowledgeCategoryValue())
  const [term, setTerm] = createSignal("")
  const [docs, setDocs] = createSignal(resetDocumentList())
  const [page, setPage] = createSignal(1)
  const data = createQuery(() => ({
    queryKey: ["knowledge", "categories", sdk.directory, props.client, props.dataset],
    queryFn: () => createKnowledgeApi(sdk.client, props.client).categories(props.dataset),
    retry,
  }))

  const tree = createMemo(() => {
    const value = data.data
    if (!value) return []
    return buildCategoryTree({
      all: value.statistics.all_documents,
      uncategorized: value.statistics.uncategorized,
      categories: value.categories,
    })
  })
  const filtered = createMemo(() => filterCategoryTree(tree(), search()))
  const current = createMemo(() => selected())
  const currentLabel = createMemo(() => categoryLabel(tree(), current()))
  const list = createQuery(() => ({
    queryKey: ["knowledge", "documents", sdk.directory, props.client, props.dataset, current(), term(), page()],
    queryFn: () => {
      const value = current()
      return createKnowledgeApi(sdk.client, props.client).documents({
        dataset: props.dataset,
        category: value === allValue ? undefined : value,
        page: page(),
        size: 20,
        name: term() || undefined,
      })
    },
    retry,
  }))

  createEffect(on([current, term], () => {
    setDocs(resetDocumentList())
    setPage(1)
  }))

  createEffect(() => {
    const next = list.data?.page
    if (!next) return
    if (!shouldAppendDocumentPage(docs(), next)) return
    setDocs((prev) => appendDocumentPage(prev, next))
  })

  const more = () =>
    canLoadMoreDocuments({
      loading: documentLoading({
        pending: !!list.isPending,
        fetching: !!list.isFetching,
      }),
      size: docs().records.length,
      total: docs().total,
    })

  return (
    <div class={documentView.root}>
      <div class={`${documentView.pane} p-4`}>
        <div class="mb-3 text-14-medium text-text-strong">{language.t("knowledge.documents.categories")}</div>
        <TextField
          value={search()}
          onChange={setSearch}
          placeholder={language.t("knowledge.documents.searchCategory")}
        />
        <div class={documentView.category}>
          <Show when={data.isPending}>
            <div class="text-13-regular text-text-weak">{language.t("knowledge.documents.loadingCategories")}</div>
          </Show>
          <Show when={data.error}>
            <div class="text-13-regular text-text-danger-base">
              {data.error instanceof Error ? data.error.message : String(data.error)}
            </div>
          </Show>
          <For each={filtered()}>
            {(item) => (
              <button
                type="button"
                class="flex items-center justify-between rounded-md px-3 py-2 text-left hover:bg-surface-raised-base-hover"
                classList={{ "bg-surface-base-active": current() === item.value }}
                onClick={() => setSelected(item.value)}
              >
                <span class="text-13-regular text-text-strong">{item.name}</span>
                <span class="text-12-medium text-text-weaker">{item.count}</span>
              </button>
            )}
          </For>
        </div>
      </div>
      <div class={`${documentView.pane} p-6`}>
        <div class="flex flex-col gap-2">
          <div class="text-18-medium text-text-strong">{language.t("knowledge.page.dataset")}</div>
          <div class="text-13-regular text-text-weak">
            {language.t("knowledge.documents.selectedCategory", { value: currentLabel() })}
          </div>
        </div>
        <div class="mt-4 flex items-center justify-between gap-3">
          <TextField
            value={term()}
            onChange={setTerm}
            placeholder={language.t("knowledge.documents.searchDocument")}
          />
          <Show when={docs().total > 0}>
            <div class="text-12-medium text-text-weaker">
              {language.t("knowledge.documents.count", { count: docs().total })}
            </div>
          </Show>
        </div>
        <div class={documentView.documents}>
          <Show when={list.error}>
            <div class="text-13-regular text-text-danger-base">
              {list.error instanceof Error ? list.error.message : String(list.error)}
            </div>
          </Show>
          <Show when={!list.error && docs().records.length === 0 && list.isPending}>
            <div class="text-13-regular text-text-weak">{language.t("knowledge.documents.loadingDocuments")}</div>
          </Show>
          <For each={docs().records}>
            {(item) => (
              <A
                href={knowledgeHref(sdk.directory, props.dataset, item.id, props.client)}
                class="block rounded-lg border border-border-weak-base px-4 py-3 hover:bg-surface-raised-base-hover transition-colors"
              >
                <div class="text-14-medium text-text-strong">{item.name}</div>
                <div class="mt-1 text-12-medium text-text-weaker">
                  {language.t("knowledge.documents.recordMeta", {
                    chars: item.char_length ?? 0,
                    paragraphs: item.paragraph_count ?? 0,
                  })}
                </div>
              </A>
            )}
          </For>
          <Show when={!list.isPending && !list.error && docs().records.length === 0}>
            <div class="text-13-regular text-text-weak">{language.t("knowledge.documents.empty")}</div>
          </Show>
          <Show when={more()}>
            <button
              type="button"
              class="self-start rounded-md border border-border-weak-base px-3 py-2 text-13-medium text-text-strong hover:bg-surface-raised-base-hover"
              onClick={() => setPage(docs().page + 1)}
            >
              {language.t("knowledge.documents.loadMore")}
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
