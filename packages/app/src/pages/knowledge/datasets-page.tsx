import { For, Show } from "solid-js"
import { A } from "@solidjs/router"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { knowledgeHref } from "./route"

export function DatasetsPage(props: {
  data?: {
    datasets: Array<{
      id: string
      name: string
      desc?: string
      document_count?: number
      char_length?: number
    }>
  }
  loading: boolean
  error?: unknown
  client?: string
}) {
  const language = useLanguage()
  const sdk = useSDK()

  return (
    <>
      <Show when={props.error}>
        <div class="text-13-regular text-text-danger-base">
          {props.error instanceof Error ? props.error.message : String(props.error)}
        </div>
      </Show>
      <Show when={!props.error && props.loading}>
        <div class="text-13-regular text-text-weak">{language.t("knowledge.loading.datasets")}</div>
      </Show>
      <Show when={!props.error && !props.loading && props.data}>
        <div class="grid w-full grid-cols-1 gap-4 md:grid-cols-2 xl:grid-cols-3">
          <For each={props.data?.datasets}>
            {(item) => (
              <A
                href={knowledgeHref(sdk.directory, item.id, undefined, props.client)}
                class="rounded-xl border border-border-weak-base bg-surface-base p-4 hover:bg-surface-raised-base-hover transition-colors"
              >
                <div class="flex flex-col gap-2">
                  <div class="text-15-medium text-text-strong">{item.name}</div>
                  <div class="text-13-regular text-text-weak line-clamp-2">
                    {item.desc || language.t("knowledge.dataset.emptyDescription")}
                  </div>
                  <div class="text-12-medium text-text-weaker">
                    {language.t("knowledge.dataset.meta", {
                      documents: item.document_count ?? 0,
                      chars: item.char_length ?? 0,
                    })}
                  </div>
                </div>
              </A>
            )}
          </For>
        </div>
      </Show>
    </>
  )
}
