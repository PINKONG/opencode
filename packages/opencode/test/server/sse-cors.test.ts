import { afterEach, describe, expect, test } from "bun:test"
import { InstanceRuntime } from "../../src/project/instance-runtime"
import { Server } from "../../src/server/server"
import { tmpdir } from "../fixture/fixture"

afterEach(async () => {
  await InstanceRuntime.disposeAllInstances().catch(() => undefined)
})

describe("server SSE CORS", () => {
  test(
    "returns CORS headers for SSE endpoints",
    async () => {
    await using tmp = await tmpdir({ git: true })
    const listener = await Server.listen({
      hostname: "127.0.0.1",
      port: 0,
    })

    try {
      for (const input of [
        {
          path: "/global/event",
          headers: {} as Record<string, string>,
        },
        {
          path: "/event",
          headers: {
            "x-opencode-directory": tmp.path,
          } as Record<string, string>,
        },
      ]) {
        const abort = new AbortController()
        const response = await fetch(new URL(input.path, listener.url), {
          headers: {
            Origin: "http://localhost:3000",
            ...input.headers,
          },
          signal: abort.signal,
        })

        expect(response.status).toBe(200)
        expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
        expect(response.headers.get("access-control-allow-credentials")).toBe("true")
        expect(response.headers.get("vary")?.includes("Origin")).toBe(true)
        await response.body?.getReader().read()
        abort.abort()
      }
    } finally {
      await listener.stop(true)
    }
    },
    { timeout: 15000 },
  )

  test("answers SSE preflight with requested auth headers", async () => {
    const listener = await Server.listen({
      hostname: "127.0.0.1",
      port: 0,
    })

    try {
      const response = await fetch(new URL("/global/event", listener.url), {
        method: "OPTIONS",
        headers: {
          Origin: "http://localhost:3000",
          "Access-Control-Request-Method": "GET",
          "Access-Control-Request-Headers": "Authorization, Content-Type",
        },
      })

      expect(response.status).toBe(204)
      expect(response.headers.get("access-control-allow-origin")).toBe("http://localhost:3000")
      expect(response.headers.get("access-control-allow-credentials")).toBe("true")
      expect(response.headers.get("access-control-allow-headers")).toContain("Authorization")
      expect(response.headers.get("access-control-allow-headers")).toContain("Content-Type")
    } finally {
      await listener.stop(true)
    }
  })
})
