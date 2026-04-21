import { afterEach, describe, expect, test } from "bun:test"
import { Instance } from "../../src/project/instance"
import { Server } from "../../src/server/server"
import { Log } from "../../src/util"
import { tmpdir } from "../fixture/fixture"

Log.init({ print: false })

afterEach(async () => {
  await Instance.disposeAll()
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
