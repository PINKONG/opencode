import { describe, expect, test } from "bun:test"
import { buildServerAccessUrl } from "./server-access-url"

describe("buildServerAccessUrl", () => {
  test("returns base url when no password is provided", () => {
    const result = buildServerAccessUrl({
      url: "http://127.0.0.1:4096",
    })
    expect(result).toBe("http://127.0.0.1:4096/")
  })

  test("appends auth_token when password exists", () => {
    const result = buildServerAccessUrl({
      url: "http://127.0.0.1:4096",
      username: "opencode",
      password: "secret",
    })
    expect(result).toBe("http://127.0.0.1:4096/?auth_token=b3BlbmNvZGU6c2VjcmV0")
  })
})
