import { expect, test } from "bun:test"
import { createExternalContextSync } from "./external-context-sync"

test("serializes updates and retries the same request after a network failure", async () => {
  const calls: string[] = []
  let attempts = 0
  const sync = createExternalContextSync(async (input) => {
    calls.push(input.requestId)
    if (++attempts < 3) throw new TypeError("fetch failed")
  }, () => Promise.resolve())
  const data = { pageId: "page" }
  await sync.bind("session", "/work", data)
  await sync.bind("session", "/work", data)
  expect(calls.length).toBe(3)
  expect(new Set(calls).size).toBe(1)
})

test("keeps failures visible to prompt admission and accepts a later update", async () => {
  let attempts = 0
  const sync = createExternalContextSync(async () => {
    if (++attempts === 1) throw new Error("permission denied")
  })
  const data = { pageId: "old" }
  await expect(sync.bind("session", "/work", data)).rejects.toThrow("permission denied")
  await expect(sync.bind("session", "/work", data)).rejects.toThrow("permission denied")
  await sync.bind("session", "/work", { pageId: "new" })
  expect(attempts).toBe(2)
})
