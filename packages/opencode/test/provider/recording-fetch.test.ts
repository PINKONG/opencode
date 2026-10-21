import { expect, test } from "bun:test"
import { createWireCapture } from "@/provider/recording-fetch"

test("recording fetch captures wire headers and bodies without consuming the response", async () => {
  const wire = createWireCapture()
  const base = Object.assign(async (input: RequestInfo | URL) => {
    const request = new Request(input)
    expect(await request.text()).toBe('{"secret":"request"}')
    return new Response("response-secret", { headers: { "x-provider": "example" } })
  }, { preconnect: () => {} })
  const response = await wire.wrap(base)("https://provider.example/v1/chat", {
    method: "POST",
    headers: { authorization: "Bearer secret" },
    body: '{"secret":"request"}',
  })
  expect(await response.text()).toBe("response-secret")
  expect(await wire.exchanges()).toEqual([{
    request: {
      url: "https://provider.example/v1/chat",
      method: "POST",
      headers: expect.objectContaining({ authorization: "Bearer secret" }),
      body: '{"secret":"request"}',
    },
    response: { status: 200, headers: expect.objectContaining({ "x-provider": "example" }), body: "response-secret" },
  }])
})

test("recording fetch keeps the request when the transport fails", async () => {
  const wire = createWireCapture()
  const base = Object.assign(async () => { throw new Error("offline") }, { preconnect: () => {} }) as typeof fetch
  await expect(wire.wrap(base)("https://provider.example/v1/chat", {
    method: "POST", headers: { authorization: "Bearer secret" }, body: "request-secret",
  })).rejects.toThrow("offline")
  expect(await wire.exchanges()).toEqual([{
    request: { url: "https://provider.example/v1/chat", method: "POST", headers: expect.objectContaining({ authorization: "Bearer secret" }), body: "request-secret" },
    response: { error: "Error: offline" },
  }])
})

test("recording fetch bounds an unending response snapshot", async () => {
  const wire = createWireCapture()
  let close!: () => void
  const base = Object.assign(async () => new Response(new ReadableStream({ start(controller) { close = () => controller.close() } })), { preconnect: () => {} }) as typeof fetch
  await wire.wrap(base)("https://provider.example/v1/chat")
  expect(await wire.exchanges(20)).toEqual([])
  close()
})
