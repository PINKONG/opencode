import { describe, expect, test } from "bun:test"
import { issueEmbedSession, resolveEmbedSession } from "./embed-session"

describe("embed-session", () => {
  test("resolves issued session immediately", () => {
    const token = "abc"
    const key = issueEmbedSession(token)
    expect(resolveEmbedSession(key)).toBe(token)
  })

  test("does not expire after long time", () => {
    const token = "long-lived"
    const originalNow = Date.now
    const base = 1_700_000_000_000
    Date.now = () => base
    const key = issueEmbedSession(token)
    Date.now = () => base + 365 * 24 * 60 * 60 * 1000
    expect(resolveEmbedSession(key)).toBe(token)
    Date.now = originalNow
  })

  test("returns undefined for missing key", () => {
    expect(resolveEmbedSession("es_missing")).toBeUndefined()
  })
})
