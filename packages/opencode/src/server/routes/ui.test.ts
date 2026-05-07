import { afterEach, describe, expect, mock, test } from "bun:test"
import { Hono } from "hono"
import { UIRoutes } from "./ui"
import { Flag } from "@opencode-ai/core/flag/flag"

const originalDisableEmbedded = Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI
const originalFetch = globalThis.fetch

afterEach(() => {
  Flag.OPENCODE_DISABLE_EMBEDDED_WEB_UI = originalDisableEmbedded
  globalThis.fetch = originalFetch
  mock.restore()
})

describe("UIRoutes", () => {
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
