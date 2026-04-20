import { afterEach, describe, expect, mock, test } from "bun:test"
import { Layer } from "effect"
import { tmpdir } from "../fixture/fixture"

let out: unknown

const runtime = await import("../../src/effect/app-runtime")
mock.module("../../src/effect/app-runtime", () => ({
  ...runtime,
  AppRuntime: {
    ...runtime.AppRuntime,
    runPromise: async () => out,
  },
}))

const { Instance } = await import("../../src/project/instance")
const { Server } = await import("../../src/server/server")

afterEach(async () => {
  out = undefined
  await Instance.disposeAll()
})

describe("experimental tool call route", () => {
  test("returns null when the client is not connected", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default().app
    out = null

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

  test("returns MCP tool payload for allowed tool names", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default().app
    out = {
      content: [
        {
          type: "text",
          text: "{\"page\":{\"records\":[],\"total\":0}}",
        },
      ],
      isError: false,
    }

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
    expect(await response.json()).toEqual(out)
  })
})
