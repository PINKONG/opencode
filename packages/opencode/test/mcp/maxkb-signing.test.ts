import { describe, expect, test } from "bun:test"
import {
  buildMaxkbCanonical,
  createMaxkbSignedFetch,
  createMaxkbSignedHeaders,
  createMaxkbNonce,
  normalizeMaxkbBody,
  sha256Hex,
  signMaxkbCanonical,
} from "../../src/mcp/maxkb"

describe("maxkb signing", () => {
  test("builds canonical string with exact path and raw query", () => {
    const out = buildMaxkbCanonical({
      method: "post",
      path: "/mcp/",
      rawQuery: "a=1&b=2",
      bodySha256Hex: "bodyhash",
      timestamp: "1713340800",
      nonce: "nonce123",
    })

    expect(out).toBe("POST\n/mcp/\na=1&b=2\nbodyhash\n1713340800\nnonce123")
  })

  test("distinguishes /mcp/ from /mcp", () => {
    const slash = buildMaxkbCanonical({
      method: "POST",
      path: "/mcp/",
      rawQuery: "",
      bodySha256Hex: "hash",
      timestamp: "1713340800",
      nonce: "nonce123",
    })
    const noSlash = buildMaxkbCanonical({
      method: "POST",
      path: "/mcp",
      rawQuery: "",
      bodySha256Hex: "hash",
      timestamp: "1713340800",
      nonce: "nonce123",
    })

    expect(slash).not.toBe(noSlash)
  })

  test("hashes empty body to sha256 of empty bytes", async () => {
    expect(await sha256Hex(new Uint8Array())).toBe("e3b0c44298fc1c149afbf4c8996fb92427ae41e4649b934ca495991b7852b855")
  })

  test("normalizes string body", async () => {
    const out = await normalizeMaxkbBody("hello")
    expect(new TextDecoder().decode(out)).toBe("hello")
  })

  test("normalizes Uint8Array body", async () => {
    const out = await normalizeMaxkbBody(new Uint8Array([104, 105]))
    expect(new TextDecoder().decode(out)).toBe("hi")
  })

  test("normalizes ArrayBuffer body", async () => {
    const out = await normalizeMaxkbBody(new Uint8Array([104, 105]).buffer)
    expect(new TextDecoder().decode(out)).toBe("hi")
  })

  test("rejects ReadableStream body", async () => {
    const stream = new ReadableStream({
      start(controller) {
        controller.enqueue(new TextEncoder().encode("hello"))
        controller.close()
      },
    })

    await expect(normalizeMaxkbBody(stream)).rejects.toThrow("ReadableStream bodies are not supported")
  })

  test("creates 32-char hex nonce", () => {
    const out = createMaxkbNonce()
    expect(out).toHaveLength(32)
    expect(out).toMatch(/^[0-9a-f]{32}$/)
  })

  test("creates different nonces on successive calls", () => {
    expect(createMaxkbNonce()).not.toBe(createMaxkbNonce())
  })

  test("signs canonical string with hmac sha256", () => {
    const out = signMaxkbCanonical("ms_secret", "POST\n/mcp/\n\nbodyhash\n1713340800\nnonce123")
    expect(out).toHaveLength(64)
    expect(out).toMatch(/^[0-9a-f]{64}$/)
  })

  test("preserves sdk headers when adding maxkb headers", async () => {
    const headers = await createMaxkbSignedHeaders(
      {
        appKey: "mcp_test",
        appSecret: "ms_test",
      },
      {
        method: "POST",
        path: "/mcp/",
        rawQuery: "",
        body: new TextEncoder().encode("{}"),
        headers: new Headers({
          "mcp-session-id": "session-1",
          "content-type": "application/json",
          "mcp-protocol-version": "2024-11-05",
        }),
      },
      {
        timestamp: "1713340800",
        nonce: "nonce1234567890abcdef1234567890ab",
      },
    )

    expect(headers.get("mcp-session-id")).toBe("session-1")
    expect(headers.get("content-type")).toBe("application/json")
    expect(headers.get("mcp-protocol-version")).toBe("2024-11-05")
    expect(headers.get("X-MCP-App-Key")).toBe("mcp_test")
    expect(headers.get("X-MCP-Timestamp")).toBe("1713340800")
    expect(headers.get("X-MCP-Nonce")).toBe("nonce1234567890abcdef1234567890ab")
    expect(headers.get("X-MCP-Signature")).toBeDefined()
  })

  test("signed fetch preserves headers and adds maxkb auth", async () => {
    let seen: Request | undefined
    const fetch = createMaxkbSignedFetch(
      {
        appKey: "mcp_test",
        appSecret: "ms_test",
      },
      async (input, init) => {
        seen = input instanceof Request ? input : new Request(input, init)
        return new Response("ok", { status: 200 })
      },
    )

    await fetch("http://127.0.0.1:8081/mcp/?a=1", {
      method: "POST",
      headers: {
        "mcp-session-id": "session-1",
        "content-type": "application/json",
        "mcp-protocol-version": "2024-11-05",
      },
      body: "{}",
    })

    expect(seen).toBeDefined()
    expect(seen?.headers.get("mcp-session-id")).toBe("session-1")
    expect(seen?.headers.get("content-type")).toBe("application/json")
    expect(seen?.headers.get("mcp-protocol-version")).toBe("2024-11-05")
    expect(seen?.headers.get("X-MCP-App-Key")).toBe("mcp_test")
    expect(seen?.headers.get("X-MCP-Timestamp")).toBeDefined()
    expect(seen?.headers.get("X-MCP-Nonce")).toMatch(/^[0-9a-f]{32}$/)
    expect(seen?.headers.get("X-MCP-Signature")).toMatch(/^[0-9a-f]{64}$/)
  })

  test("signed fetch rebuilds GET request without body", async () => {
    let seen: Request | undefined
    const fetch = createMaxkbSignedFetch(
      {
        appKey: "mcp_test",
        appSecret: "ms_test",
      },
      async (input, init) => {
        seen = input instanceof Request ? input : new Request(input, init)
        return new Response("ok", { status: 200 })
      },
    )

    await expect(fetch("http://127.0.0.1:8081/mcp/", { method: "GET" })).resolves.toBeInstanceOf(Response)
    expect(seen).toBeDefined()
    expect(seen?.method).toBe("GET")
    expect(await seen?.text()).toBe("")
  })
})
