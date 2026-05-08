import { afterEach, describe, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { UIRoutes } from "./ui"
import { Flag } from "@opencode-ai/core/flag/flag"
import path from "node:path"
import { tmpdir } from "../../../test/fixture/fixture"

const originalDisableEmbedded = Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI
const originalFetch = globalThis.fetch

afterEach(() => {
  Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI = originalDisableEmbedded
  globalThis.fetch = originalFetch
  mock.restore()
})

describe("UIRoutes", () => {
  test("serves embedded html as html content", async () => {
    await using tmp = await tmpdir()
    const htmlFile = path.join(tmp.path, "index.html")
    await Bun.write(htmlFile, "<html><head></head><body>ok</body></html>")

    const app = new Hono().route(
      "/",
      UIRoutes({
        embeddedWebUI: {
          "index.html": htmlFile,
        },
      }),
    )

    const res = await app.request("http://localhost/")

    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("text/html")
    expect(await res.text()).toContain("<body>ok</body>")
  })

  test("removes alt-svc from proxied html response", async () => {
    Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI = true
    globalThis.fetch = mock(
      async () =>
        new Response("<html><head></head><body>ok</body></html>", {
          status: 200,
          headers: {
            "content-type": "text/html; charset=utf-8",
            "alt-svc": 'h3=":443"; ma=86400',
          },
        }),
    ) as unknown as typeof fetch

    const app = new Hono().route("/", UIRoutes())
    const res = await app.request("http://localhost/")
    expect(res.status).toBe(200)
    expect(res.headers.get("alt-svc")).toBeNull()
  })

  test("adds csp hash for embedded html inline preload script", async () => {
    Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI = false
    globalThis.fetch = originalFetch
    const app = new Hono().route("/", UIRoutes())
    const res = await app.request("http://localhost/")
    expect(res.status).toBe(200)
    const csp = res.headers.get("content-security-policy") ?? ""
    expect(csp.includes("sha256-")).toBe(true)
  })
})
