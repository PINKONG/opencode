import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { createQuery } from "@tanstack/solid-query"
import { useDialog } from "@opencode-ai/ui/context/dialog"
import { TextField } from "@opencode-ai/ui/text-field"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { createKnowledgeApi } from "@/data/knowledge-api"
import { shouldRetryMaxkb } from "@/data/maxkb"
import {
  appendParagraphPage,
  canLoadMoreParagraphs,
  filterParagraphs,
  paragraphLabel,
  paragraphPreview,
  resetParagraphList,
  shouldAppendParagraphPage,
} from "./paragraph-list"
import { paragraphHasContent, paragraphLoadMoreVisible } from "./paragraphs-view"
import { loadDocument, loadParagraphs } from "./paragraph-data"
import { DialogKnowledgeParagraph } from "./dialog-knowledge-paragraph"

const retry = (count: number, err: unknown) => shouldRetryMaxkb({ count, err })

export function ParagraphsPage(props: { client: string; dataset: string; document: string }) {
  const language = useLanguage()
  const sdk = useSDK()
  const dialog = useDialog()
  const api = createMemo(() => createKnowledgeApi(sdk.client, props.client))
  const [term, setTerm] = createSignal("")
  const [list, setList] = createSignal(resetParagraphList())
  const [offset, setOffset] = createSignal(0)

  const detail = createQuery(() => ({
    queryKey: ["knowledge", "document", sdk.directory, props.client, props.dataset, props.document],
    queryFn: () => loadDocument({ document: () => api().document(props.dataset, props.document) }),
    retry,
  }))

  const page = createQuery(() => ({
    queryKey: ["knowledge", "paragraphs", sdk.directory, props.client, props.dataset, props.document, offset()],
    queryFn: () =>
      loadParagraphs(
        { paragraphs: (input) => api().paragraphs(input) },
        {
          dataset: props.dataset,
          document: props.document,
          limit: 20,
          offset: offset(),
        },
      ),
    retry,
  }))

  createEffect(() => {
    const next = page.data?.page
    if (!next) return
    if (!shouldAppendParagraphPage(list(), next)) return
    setList((prev) => appendParagraphPage(prev, {
      offset: next.offset + next.records.length,
      total: next.total,
      records: next.records,
    }))
  })

  const rows = createMemo(() => filterParagraphs(list().records, term()))
  const more = () =>
    canLoadMoreParagraphs({
      loading: !!page.isPending || !!page.isFetching,
      size: list().records.length,
      total: list().total,
    })

  return (
    <div class="flex size-full min-h-0 flex-col gap-4 p-6">
      <div class="flex flex-col gap-2 rounded-xl border border-border-weak-base bg-surface-base p-6">
        <Show when={detail.data} fallback={<div class="text-13-regular text-text-weak">{language.t("common.loading")}</div>}>
          {(value) => (
            <>
              <div class="text-20-medium text-text-strong">{value().document.name}</div>
              <div class="text-13-regular text-text-weak">
                {language.t("knowledge.paragraphs.meta", {
                  paragraphs: value().document.paragraph_count ?? list().total,
                  chars: value().document.char_length ?? 0,
                })}
              </div>
              <div class="text-12-medium text-text-weaker">
                {language.t("knowledge.paragraphs.status", {
                  mode: value().document.hit_handling_method ?? "-",
                  state: value().document.is_active ? "active" : "inactive",
                })}
              </div>
            </>
          )}
        </Show>
        <Show when={detail.error}>
          <div class="text-13-regular text-text-danger-base">
            {detail.error instanceof Error ? detail.error.message : String(detail.error)}
          </div>
        </Show>
      </div>

      <div class="min-h-0 rounded-xl border border-border-weak-base bg-surface-base p-6">
        <div class="flex items-center justify-between gap-3">
          <TextField
            value={term()}
            onChange={setTerm}
            placeholder={language.t("knowledge.paragraphs.search")}
          />
          <Show when={list().total > 0}>
            <div class="text-12-medium text-text-weaker">
              {language.t("knowledge.paragraphs.count", { count: list().total })}
            </div>
          </Show>
        </div>

        <div class="mt-4 flex min-h-0 flex-col gap-3 overflow-y-auto">
          <Show when={page.error}>
            <div class="text-13-regular text-text-danger-base">
              {page.error instanceof Error ? page.error.message : String(page.error)}
            </div>
          </Show>
          <Show when={!page.error && list().records.length === 0 && page.isPending}>
            <div class="text-13-regular text-text-weak">{language.t("knowledge.paragraphs.loading")}</div>
          </Show>
          <For each={rows()}>
            {(item, index) => (
              <button
                type="button"
                class="rounded-lg border border-border-weak-base px-4 py-4 text-left hover:bg-surface-raised-base-hover transition-colors"
                disabled={!paragraphHasContent({ content: item.content })}
                onClick={() =>
                  dialog.show(() => (
                    <DialogKnowledgeParagraph
                      title={paragraphLabel(item, index() + 1)}
                      item={item}
                    />
                  ))
                }
              >
                <div class="text-14-medium text-text-strong">{paragraphLabel(item, index() + 1)}</div>
                <div class="mt-2 text-13-regular text-text-weak">{paragraphPreview(item.content, 160)}</div>
                <div class="mt-2 text-12-medium text-text-weaker">
                  {language.t("knowledge.paragraphs.recordMeta", {
                    chars: item.content.length,
                    state: item.is_active ? "active" : "inactive",
                  })}
                </div>
              </button>
            )}
          </For>
          <Show when={!page.isPending && !page.error && rows().length === 0 && list().records.length === 0}>
            <div class="text-13-regular text-text-weak">{language.t("knowledge.paragraphs.empty")}</div>
          </Show>
          <Show when={!page.isPending && !page.error && rows().length === 0 && list().records.length > 0}>
            <div class="text-13-regular text-text-weak">{language.t("knowledge.paragraphs.emptyFilter")}</div>
          </Show>
          <Show when={paragraphLoadMoreVisible({ more: more(), search: term(), loading: !!page.isFetching })}>
            <button
              type="button"
              class="self-start rounded-md border border-border-weak-base px-3 py-2 text-13-medium text-text-strong hover:bg-surface-raised-base-hover"
              onClick={() => setOffset(list().records.length)}
            >
              {language.t("knowledge.documents.loadMore")}
            </button>
          </Show>
        </div>
      </div>
    </div>
  )
}
