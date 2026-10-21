import assert from "node:assert/strict"
import test from "node:test"
import { createOpencodeClient } from "./client.js"

test("rejects html responses with charset content-type", async () => {
  const client = createOpencodeClient({
    baseUrl: "http://localhost:4096",
    fetch: Object.assign(
      async () =>
        new Response("<!doctype html><html></html>", {
          status: 200,
          headers: {
            "content-type": "text/html;charset=UTF-8",
          },
        }),
      { preconnect: () => {} },
    ),
  })

  await assert.rejects(
    client.experimental.resource.read({ client: "demo", uri: "maxkb://datasets" }),
    /Server responded with text\/html/,
  )
})
