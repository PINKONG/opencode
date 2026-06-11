import { afterEach, describe, expect, test } from "bun:test"
import { InstanceRuntime } from "../../src/project/instance-runtime"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await InstanceRuntime.disposeAllInstances().catch(() => undefined)
})

describe("experimental resource read", () => {
  test("rejects non-maxkb resource uri", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default().app

    const response = await app.request("/experimental/resource/read", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": tmp.path,
      },
      body: JSON.stringify({
        client: "demo",
        uri: "file:///tmp/a.txt",
      }),
    })

    expect(response.status).toBe(400)
  })

  test("uses JSON response path for maxkb resource uri", async () => {
    await using tmp = await tmpdir({ git: true })
    const app = Server.Default().app

    const response = await app.request("/experimental/resource/read", {
      method: "POST",
      headers: {
        "content-type": "application/json",
        "x-opencode-directory": tmp.path,
      },
      body: JSON.stringify({
        client: "demo",
        uri: "maxkb://datasets",
      }),
    })

    expect(response.status).toBe(200)
    expect(response.headers.get("content-type")).toContain("application/json")
    expect(await response.json()).toBeNull()
  })
})

describe("experimental tool call", () => {
  test("rejects non-maxkb browse tool", async () => {
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
        name: "search_knowledge",
        arguments: {},
      }),
    })

    expect(response.status).toBe(400)
  })
})
