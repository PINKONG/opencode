import { expect, test } from "bun:test"

const testWithNodeSqlite = (await import("node:sqlite").then(
  () => test,
  () => test.skip,
)) as typeof test

testWithNodeSqlite("flushes the latest buffered draft and stores blobs", async () => {
  const { createDesktopDraftStore } = await import("./draft-store")
  const store = createDesktopDraftStore(":memory:")
  store.set("prompt", "first")
  store.set("prompt", "latest")
  expect(store.get("prompt")).toBe("latest")
  store.flush()
  expect(store.get("prompt")).toBe("latest")

  const bytes = new TextEncoder().encode("image")
  const id = store.putBlob(bytes)
  expect(store.getBlob(id)).toEqual(bytes)
  store.close()
})
