import { A } from "@solidjs/router"
import { For, Show } from "solid-js"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { knowledgeCrumbs, knowledgeExitHref, knowledgeParentHref } from "./route"

export function KnowledgeHeader(props: {
  dataset?: string
  datasetName?: string
  document?: string
  client?: string
  title: string
  description: string
}) {
  const language = useLanguage()
  const sdk = useSDK()
  const crumbs = () =>
    knowledgeCrumbs({
      root: language.t("knowledge.page.root"),
      dataset: props.dataset,
      datasetName: props.datasetName,
      document: props.document,
      documentLabel: language.t("knowledge.page.document"),
      dir: sdk.directory,
      client: props.client,
    })

  return (
    <div class="flex w-full items-start justify-between gap-4">
      <div class="flex min-w-0 flex-col gap-2">
        <div class="flex items-center gap-2 text-13-medium text-text-weak">
          <Show when={props.dataset}>
            <A
              href={knowledgeParentHref(sdk.directory, props.dataset, props.document, props.client)}
              class="rounded-md px-2 py-1 -ml-2 hover:bg-surface-raised-base-hover hover:text-text-strong transition-colors"
            >
              {language.t("common.goBack")}
            </A>
            <span class="text-text-weaker">/</span>
          </Show>
          <For each={crumbs()}>
            {(item, index) => (
              <>
                <Show when={index() > 0}>
                  <span class="text-text-weaker">/</span>
                </Show>
                <A
                  href={item.href}
                  class="truncate hover:text-text-strong transition-colors"
                  classList={{ "text-text-strong": index() === crumbs().length - 1 }}
                >
                  {item.label}
                </A>
              </>
            )}
          </For>
        </div>
        <div class="flex flex-col gap-1">
          <h1 class="text-22-semibold text-text-strong">{props.title}</h1>
          <p class="text-14-regular text-text-weak">{props.description}</p>
        </div>
      </div>
      <A
        href={knowledgeExitHref(sdk.directory)}
        class="shrink-0 rounded-md border border-border-weak-base px-3 py-2 text-13-medium text-text-strong hover:bg-surface-raised-base-hover transition-colors"
      >
        {language.t("knowledge.nav.exit")}
      </A>
    </div>
  )
}
