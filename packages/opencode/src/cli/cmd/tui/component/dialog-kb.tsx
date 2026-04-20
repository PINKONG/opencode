import { createEffect, createMemo, createResource, createSignal } from "solid-js"
import { DialogSelect, type DialogSelectOption } from "@tui/ui/dialog-select"
import { useDialog } from "@tui/ui/dialog"
import { useSDK } from "@tui/context/sdk"
import { useSync } from "@tui/context/sync"
import { useTheme } from "@tui/context/theme"
import {
  maxkbAll,
  maxkbCategoriesUri,
  maxkbDatasetText,
  maxkbDocumentDetailUri,
  maxkbDocumentText,
  findMaxkbServers,
  maxkbMore,
  maxkbParagraphText,
} from "@/mcp/maxkb-browser"
import {
  extractMaxkbText,
  extractMaxkbToolText,
  MaxkbCategoryPayload,
  type MaxkbDocument,
  MaxkbDatasetPayload,
  MaxkbDocumentDetailPayload,
  MaxkbDocumentPagePayload,
  type MaxkbParagraph,
  MaxkbParagraphPagePayload,
  parseMaxkbText,
} from "@/mcp/maxkb-resource"

type Load<T> = {
  data?: T
  err?: string
}

type DocState = {
  page: number
  rows: MaxkbDocument[]
}

type ParagraphState = {
  offset: number
  rows: MaxkbParagraph[]
}

function ok<T>(out: Load<T>): out is { data: T } {
  return out.data !== undefined
}

async function read(
  sdk: ReturnType<typeof useSDK>,
  client: string,
  uri: string,
) {
  const result = await sdk.client.experimental.resource.read(
    {
      client,
      uri,
    },
    { throwOnError: true },
  )
  return result.data
}

async function call(
  sdk: ReturnType<typeof useSDK>,
  client: string,
  name: "list_dataset_documents" | "get_document_paragraphs",
  args?: Record<string, unknown>,
) {
  const result = await sdk.client.experimental.tool.call(
    {
      client,
      name,
      arguments: args,
    },
    { throwOnError: true },
  )
  return result.data
}

async function load<T>(
  sdk: ReturnType<typeof useSDK>,
  client: string,
  uri: string,
  parse: (text: string) => T,
): Promise<Load<T>> {
  try {
    return {
      data: parse(extractMaxkbText(await read(sdk, client, uri))),
    }
  } catch (err) {
    return {
      err: err instanceof Error ? err.message : "Failed to load MaxKB resource",
    }
  }
}

async function loadTool<T>(
  sdk: ReturnType<typeof useSDK>,
  client: string,
  name: "list_dataset_documents" | "get_document_paragraphs",
  args: Record<string, unknown>,
  parse: (text: string) => T,
): Promise<Load<T>> {
  try {
    return {
      data: parse(extractMaxkbToolText(await call(sdk, client, name, args))),
    }
  } catch (err) {
    return {
      err: err instanceof Error ? err.message : "Failed to load MaxKB tool result",
    }
  }
}

function info(
  theme: ReturnType<typeof useTheme>["theme"],
  title: string,
  text: string,
  tone?: "error" | "warning",
): DialogSelectOption<string> {
  return {
    title,
    description: text,
    value: title,
    category: "MaxKB",
    onSelect: () => {},
    footer:
      tone === "error" ? (
        <text fg={theme.error}>error</text>
      ) : tone === "warning" ? (
        <text fg={theme.warning}>warning</text>
      ) : undefined,
  }
}

function truncated(theme: ReturnType<typeof useTheme>["theme"], flag?: boolean) {
  if (!flag) return undefined
  return <text fg={theme.warning}>truncated</text>
}

function total(current: number, next: number) {
  return Math.max(current, next)
}

function docs(
  rows: MaxkbDocument[],
  name: string,
  open: (item: MaxkbDocument) => void,
) {
  return rows.map<DialogSelectOption<string>>((item) => ({
    title: item.name,
    description: maxkbDocumentText(item) || undefined,
    value: item.id,
    category: name,
    onSelect: () => open(item),
  }))
}

function paragraphs(
  rows: MaxkbParagraph[],
  name: string,
) {
  return rows.map<DialogSelectOption<string>>((item) => ({
    title: item.title,
    description: maxkbParagraphText(item) || undefined,
    value: item.id,
    category: name,
    onSelect: () => {},
  }))
}

export function DialogKb() {
  const sync = useSync()
  const dialog = useDialog()
  const { theme } = useTheme()
  dialog.setSize("large")

  const servers = createMemo(() => findMaxkbServers(sync.data.mcp_resource))

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const list = servers()
    if (list.length === 0) {
      return [info(theme, "No MaxKB server", "Connect an MCP server exposing maxkb://datasets", "error")]
    }
    if (list.length === 1) {
      return [
        {
          title: list[0]!,
          description: "Connected MaxKB server",
          value: list[0]!,
          category: "MaxKB",
          onSelect: () => {
            dialog.replace(() => <DialogKbDatasets client={list[0]!} />)
          },
        },
      ]
    }

    return list.map((item) => ({
      title: item,
      description: "Connected MaxKB server",
      value: item,
      category: "MaxKB",
      onSelect: () => {
        dialog.replace(() => <DialogKbDatasets client={item} />)
      },
    }))
  })

  return (
    <DialogSelect
      title={servers().length > 1 ? "Choose knowledge base server" : "Knowledge base"}
      options={options()}
      skipFilter={servers().length <= 1}
    />
  )
}

function DialogKbDatasets(props: { client: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const { theme } = useTheme()
  dialog.setSize("large")
  const [result] = createResource(() =>
    load(sdk, props.client, "maxkb://datasets", (text) => parseMaxkbText(text, MaxkbDatasetPayload)),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const out = result()
    if (!out) return [info(theme, "Loading datasets...", "Reading maxkb://datasets")]
    if (out.err) return [info(theme, "Failed to load datasets", out.err, "error")]
    if (!ok(out)) return [info(theme, "Failed to load datasets", "MaxKB dataset response was empty", "error")]
    if (out.data.datasets.length === 0) {
      return [info(theme, "No datasets", "The MaxKB server returned an empty dataset list")]
    }

    const items = out.data.datasets.map((item) => ({
      title: item.name,
      description: maxkbDatasetText(item) || undefined,
      value: item.id,
      category: props.client,
      footer: truncated(theme, out.data.truncated),
      onSelect: () => {
        dialog.replace(() => <DialogKbCategories client={props.client} dataset={item.id} name={item.name} />)
      },
    }))

    if (!out.data.truncated) return items
    return [info(theme, "Warning", "Dataset list is truncated", "warning"), ...items]
  })

  return <DialogSelect title={`Datasets · ${props.client}`} options={options()} />
}

function DialogKbCategories(props: { client: string; dataset: string; name: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const { theme } = useTheme()
  dialog.setSize("large")
  const [result] = createResource(() =>
    load(sdk, props.client, maxkbCategoriesUri(props.dataset), (text) => parseMaxkbText(text, MaxkbCategoryPayload)),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const out = result()
    if (!out) return [info(theme, "Loading categories...", `Reading ${maxkbCategoriesUri(props.dataset)}`)]
    if (out.err) return [info(theme, "Failed to load categories", out.err, "error")]
    if (!ok(out)) return [info(theme, "Failed to load categories", "MaxKB category response was empty", "error")]
    const items: DialogSelectOption<string>[] = [
      {
        title: "All documents",
        description: `${out.data.statistics.all_documents} documents`,
        value: maxkbAll,
        category: out.data.dataset.name,
        onSelect: () => {
          dialog.replace(() => (
            <DialogKbDocuments client={props.client} dataset={props.dataset} name={props.name} category={undefined} />
          ))
        },
      },
      {
        title: "Uncategorized",
        description: `${out.data.statistics.uncategorized} documents`,
        value: "uncategorized",
        category: out.data.dataset.name,
        onSelect: () => {
          dialog.replace(() => (
            <DialogKbDocuments
              client={props.client}
              dataset={props.dataset}
              name={props.name}
              category="uncategorized"
            />
          ))
        },
      },
      ...out.data.categories.map((item) => ({
        title: item.name,
        description: `${item.document_count ?? 0} documents`,
        value: item.id,
        category: out.data.dataset.name,
        onSelect: () => {
          dialog.replace(() => (
            <DialogKbDocuments client={props.client} dataset={props.dataset} name={props.name} category={item.id} />
          ))
        },
      })),
    ]

    return items
  })

  return <DialogSelect title={`Categories · ${props.name}`} options={options()} />
}

function DialogKbDocuments(props: { client: string; dataset: string; name: string; category?: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const { theme } = useTheme()
  const [store, setStore] = createSignal<DocState>({
    page: 1,
    rows: [],
  })
  dialog.setSize("large")
  const [result] = createResource(
    () => store().page,
    (page) =>
      loadTool(
        sdk,
        props.client,
        "list_dataset_documents",
        {
          dataset_id: props.dataset,
          category_id: props.category,
          current_page: page,
          page_size: 20,
        },
        (text) => parseMaxkbText(text, MaxkbDocumentPagePayload),
      ),
  )

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const out = result()
    if (!out && store().rows.length === 0) return [info(theme, "Loading documents...", "Calling list_dataset_documents")]
    if (!out) {
      return docs(store().rows, props.name, (item) => {
        dialog.replace(() => (
          <DialogKbParagraphs client={props.client} dataset={props.dataset} document={item.id} name={item.name} />
        ))
      })
    }
    if (out.err) return [info(theme, "Failed to load documents", out.err, "error")]
    if (!ok(out)) return [info(theme, "Failed to load documents", "MaxKB document page response was empty", "error")]
    const rows =
      out.data.page.current_page === store().page
        ? store().rows.length === 0
          ? out.data.page.records
          : store().rows
        : store().rows
    if (rows.length === 0) {
      return [info(theme, "No documents", "This filter returned no documents")]
    }

    const items = docs(rows, out.data.dataset.name, (item) => {
      dialog.replace(() => (
        <DialogKbParagraphs client={props.client} dataset={props.dataset} document={item.id} name={item.name} />
      ))
    })

    if (rows.length < out.data.page.total) {
      items.push({
        title: maxkbMore(rows.length, out.data.page.total),
        description: `Load page ${store().page + 1}`,
        value: `more:${store().page + 1}`,
        category: out.data.dataset.name,
        footer: result.loading ? <text fg={theme.warning}>loading</text> : undefined,
        onSelect: () => {
          setStore((value) => ({ ...value, page: value.page + 1 }))
        },
      })
    }

    return items
  })

  createEffect(() => {
    const out = result()
    if (!out || out.err || !ok(out)) return
    setStore((value) => {
      if (out.data.page.current_page !== value.page) return value
      const rows =
        out.data.page.current_page === 1 ? out.data.page.records : [...value.rows, ...out.data.page.records]
      return { ...value, rows }
    })
  })

  const title = createMemo(() => {
    const out = result()
    if (!out) return store().rows.length > 0 ? `Documents · ${props.name} · ${store().rows.length}` : `Documents · ${props.name}`
    if (out.err || !ok(out)) return `Documents · ${props.name}`
    const size =
      out.data.page.current_page === store().page
        ? total(store().rows.length, out.data.page.records.length)
        : store().rows.length
    return `Documents · ${props.name} · ${size}/${out.data.page.total}`
  })

  return <DialogSelect title={title()} options={options()} />
}

function DialogKbParagraphs(props: { client: string; dataset: string; document: string; name: string }) {
  const dialog = useDialog()
  const sdk = useSDK()
  const { theme } = useTheme()
  const [store, setStore] = createSignal<ParagraphState>({
    offset: 0,
    rows: [],
  })
  dialog.setSize("large")
  const [detail] = createResource(() =>
    load(sdk, props.client, maxkbDocumentDetailUri(props.dataset, props.document), (text) =>
      parseMaxkbText(text, MaxkbDocumentDetailPayload),
    ),
  )
  const [result] = createResource(
    () => store().offset,
    (offset) =>
      loadTool(
        sdk,
        props.client,
        "get_document_paragraphs",
        {
          dataset_id: props.dataset,
          document_id: props.document,
          limit: 20,
          offset,
        },
        (text) => parseMaxkbText(text, MaxkbParagraphPagePayload),
      ),
  )

  const title = createMemo(() => {
    const out = detail()
    if (!out) return `Paragraphs · ${props.name}`
    if (out.err) return `Paragraphs · ${props.name} · detail failed`
    if (!ok(out)) return `Paragraphs · ${props.name}`
    return `Paragraphs · ${out.data.document.name} · ${out.data.document.paragraph_count ?? 0}`
  })

  const options = createMemo<DialogSelectOption<string>[]>(() => {
    const out = result()
    const items = [] as DialogSelectOption<string>[]
    const meta = detail()
    if (meta?.err) {
      items.push(info(theme, "Document detail unavailable", meta.err, "warning"))
    }
    if (!out && store().rows.length === 0) return [...items, info(theme, "Loading paragraphs...", "Calling get_document_paragraphs")]
    if (!out) return [...items, ...paragraphs(store().rows, props.name)]
    if (out.err) return [info(theme, "Failed to load paragraphs", out.err, "error")]
    if (!ok(out)) return [info(theme, "Failed to load paragraphs", "MaxKB paragraph page response was empty", "error")]
    const rows =
      out.data.page.offset === store().offset ? (store().rows.length === 0 ? out.data.page.records : store().rows) : store().rows
    if (rows.length === 0) {
      return [...items, info(theme, "No paragraphs", "This document has no exposed paragraphs")]
    }

    const list = paragraphs(rows, out.data.document.name)

    if (out.data.page.has_more) {
      list.push({
        title: maxkbMore(rows.length, out.data.page.total),
        description: `Load offset ${rows.length}`,
        value: `more:${rows.length}`,
        category: out.data.document.name,
        footer: result.loading ? <text fg={theme.warning}>loading</text> : undefined,
        onSelect: () => {
          setStore((value) => ({ ...value, offset: value.rows.length }))
        },
      })
    }

    return [...items, ...list]
  })

  createEffect(() => {
    const out = result()
    if (!out || out.err || !ok(out)) return
    setStore((value) => {
      if (out.data.page.offset !== value.offset) return value
      const rows = out.data.page.offset === 0 ? out.data.page.records : [...value.rows, ...out.data.page.records]
      return { ...value, rows }
    })
  })

  return <DialogSelect title={title()} options={options()} />
}
