import { afterEach, describe, expect, test } from "bun:test"
import { tmpdir } from "../fixture/fixture"

const { InstanceRuntime } = await import("../../src/project/instance-runtime")
const { Server } = await import("../../src/server/server")

afterEach(async () => {
  await InstanceRuntime.disposeAllInstances().catch(() => undefined)
})

describe("experimental tool call route", () => {
  test("returns null when the client is not connected", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default().app

    const response = await app.request("/experimental/tool/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": tmp.path,
      },
      body: JSON.stringify({
        client: "demo",
        name: "list_dataset_documents",
        arguments: {
          dataset_id: "dataset-1",
          current_page: 1,
          page_size: 20,
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })

  test("keeps allowed tool names on JSON path", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default().app

    const response = await app.request("/experimental/tool/call", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": tmp.path,
      },
      body: JSON.stringify({
        client: "demo",
        name: "get_document_paragraphs",
        arguments: {
          dataset_id: "dataset-1",
          document_id: "document-1",
          limit: 20,
          offset: 0,
        },
      }),
    })

    expect(response.status).toBe(200)
    expect(await response.json()).toBeNull()
  })
})
