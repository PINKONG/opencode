import { createEffect, createMemo, createSignal, For, Show } from "solid-js"
import { useNavigate, useParams, useSearchParams } from "@solidjs/router"
import { createQuery } from "@tanstack/solid-query"
import { useLanguage } from "@/context/language"
import { useSDK } from "@/context/sdk"
import { createKnowledgeApi } from "@/data/knowledge-api"
import { shouldRetryMaxkb } from "@/data/maxkb"
import { knowledgeHref, knowledgeRootOnClientChange } from "./route"
import { loadDatasets, selectKnowledgeClient } from "./datasets"
import { DatasetsPage } from "./datasets-page"
import { DocumentsPage } from "./documents"
import { KnowledgeHeader } from "./header"
import { ParagraphsPage } from "./paragraphs"
import { useKnowledgeAvailability } from "./use-knowledge-availability"

export default function KnowledgePage() {
  const params = useParams()
  const [query] = useSearchParams<{ client?: string }>()
  const language = useLanguage()
  const sdk = useSDK()
  const navigate = useNavigate()
  const dataset = createMemo(() => params.dataset)
  const document = createMemo(() => params.document)
  const availability = useKnowledgeAvailability(() => sdk.directory)
  const clients = createMemo(() => availability.data?.clients ?? [])
  const [selected, setSelected] = createSignal<string>()
  const client = createMemo(() => selectKnowledgeClient(clients(), selected()))
  const api = createMemo(() => (client() ? createKnowledgeApi(sdk.client, client()!) : undefined))
  const datasets = createQuery(() => ({
    enabled: !dataset() && !document() && !!client(),
    queryKey: ["knowledge", "datasets", sdk.directory, client() ?? ""],
    queryFn: () => loadDatasets(api()!),
    retry: (count, err) => shouldRetryMaxkb({ count, err }),
  }))
  const datasetMeta = createQuery(() => ({
    enabled: !!client() && !!dataset(),
    queryKey: ["knowledge", "dataset-meta", sdk.directory, client() ?? "", dataset() ?? ""],
    queryFn: () => api()!.categories(dataset()!),
    retry: (count, err) => shouldRetryMaxkb({ count, err }),
  }))
  const documentMeta = createQuery(() => ({
    enabled: !!client() && !!dataset() && !!document(),
    queryKey: ["knowledge", "document-meta", sdk.directory, client() ?? "", dataset() ?? "", document() ?? ""],
    queryFn: () => api()!.document(dataset()!, document()!),
    retry: (count, err) => shouldRetryMaxkb({ count, err }),
  }))
  const data = createMemo(() => datasets.data)
  createEffect(() => {
    if (query.client && clients().includes(query.client) && selected() !== query.client) {
      setSelected(query.client)
      return
    }
    const picked = client()
    if (!picked) return
    if (selected() === picked) return
    setSelected(picked)
  })
  const datasetName = createMemo(() => {
    if (!dataset()) return undefined
    if (document()) return documentMeta.data?.dataset.name
    return datasetMeta.data?.dataset.name ?? data()?.datasets.find((item) => item.id === dataset())?.name
  })

  return (
    <div class="size-full flex flex-col items-start gap-4 p-6">
      <KnowledgeHeader
        dataset={dataset()}
        datasetName={datasetName()}
        document={document()}
        client={client()}
      />
      <Show when={!dataset() && !document() && clients().length > 1}>
        <div class="flex flex-col gap-2">
          <div class="text-13-regular text-text-weak">
            {language.t("knowledge.client.multiple", { count: clients().length })}
          </div>
          <label class="text-12-medium text-text-weaker">
            {language.t("knowledge.client.label")}
          </label>
          <select
            class="h-9 min-w-64 rounded-md border border-border-weak-base bg-surface-base px-3 text-13-regular text-text-strong"
            value={selected() ?? ""}
            onChange={(event) => {
              const value = event.currentTarget.value
              setSelected(value || undefined)
              navigate(knowledgeRootOnClientChange(sdk.directory))
            }}
          >
            <option value="">{language.t("knowledge.client.placeholder")}</option>
            <For each={clients()}>
              {(item) => <option value={item}>{item}</option>}
            </For>
          </select>
        </div>
      </Show>
      <Show when={!dataset() && !document()}>
        <DatasetsPage
          data={data()}
          loading={!!datasets.isPending}
          error={datasets.error}
          client={client()}
        />
      </Show>
      <Show when={dataset()}>
        <Show when={!document()}>
          <Show when={client()} keyed>
            {(client) => <DocumentsPage client={client} dataset={dataset()!} />}
          </Show>
        </Show>
      </Show>
      <Show when={dataset() && document()}>
        <Show when={client()} keyed>
          {(client) => <ParagraphsPage client={client} dataset={dataset()!} document={document()!} />}
        </Show>
      </Show>
    </div>
  )
}
