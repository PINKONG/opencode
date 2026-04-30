import { describe, expect, test } from "bun:test"
import { readEmbedSessionFromQuery } from "./embed-session"

describe("readEmbedSessionFromQuery", () => {
  test("returns embed session from search string", () => {
    expect(readEmbedSessionFromQuery("?embed_session=abc123")).toBe("abc123")
  })

  test("returns undefined when query key is absent", () => {
    expect(readEmbedSessionFromQuery("?foo=bar")).toBeUndefined()
  })
})

