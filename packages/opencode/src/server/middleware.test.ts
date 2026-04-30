import { afterEach, beforeEach, describe, expect, test } from "bun:test"
import { Hono } from "hono"
import { AuthMiddleware } from "./middleware"
import { Flag } from "@/flag/flag"

const originalPassword = Flag.OPENCODE_SERVER_PASSWORD
const originalUsername = Flag.OPENCODE_SERVER_USERNAME

beforeEach(() => {
  Flag.OPENCODE_SERVER_PASSWORD = "secret"
  Flag.OPENCODE_SERVER_USERNAME = "opencode"
})

afterEach(() => {
  Flag.OPENCODE_SERVER_PASSWORD = originalPassword
  Flag.OPENCODE_SERVER_USERNAME = originalUsername
})

function app() {
  return new Hono()
    .use(AuthMiddleware)
    .get("/ok", (c) => c.text("ok"))
    .get("/asset.js", (c) => c.text("console.log('ok')"))
}

describe("AuthMiddleware", () => {
  test("accepts auth_token query and sets auth cookie", async () => {
    const token = Buffer.from("opencode:secret").toString("base64")
    const res = await app().request(`http://localhost/ok?auth_token=${token}`)
    expect(res.status).toBe(200)
    const cookie = res.headers.get("set-cookie")
    expect(cookie).toContain("wiscode_auth_token=")
    expect(cookie).toContain("Max-Age=28800")
  })

  test("accepts follow-up request via auth cookie", async () => {
    const token = Buffer.from("opencode:secret").toString("base64")
    const first = await app().request(`http://localhost/ok?auth_token=${token}`)
    const cookie = first.headers.get("set-cookie")
    expect(cookie).toBeTruthy()
    const second = await app().request("http://localhost/asset.js", {
      headers: { cookie: cookie!.split(";")[0] },
    })
    expect(second.status).toBe(200)
  })

  test("still rejects missing auth when password is configured", async () => {
    const res = await app().request("http://localhost/ok")
    expect(res.status).toBe(401)
  })

  test("keeps explicit authorization header even when auth cookie exists", async () => {
    const stale = Buffer.from("opencode:wrong").toString("base64")
    const ok = Buffer.from("opencode:secret").toString("base64")
    const res = await app().request("http://localhost/ok", {
      headers: {
        authorization: `Basic ${ok}`,
        cookie: `wiscode_auth_token=${stale}`,
      },
    })
    expect(res.status).toBe(200)
  })

  test("allows requests when server password is not configured", async () => {
    Flag.OPENCODE_SERVER_PASSWORD = undefined
    const res = await app().request("http://localhost/ok")
    expect(res.status).toBe(200)
  })
})
