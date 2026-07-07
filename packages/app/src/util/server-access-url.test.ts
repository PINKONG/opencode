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
      username: "wiscode",
      password: "secret",
    })
    expect(result).toBe("http://127.0.0.1:4096/?auth_token=d2lzY29kZTpzZWNyZXQ%3D")
  })

  test("preserves embed_session on base url", () => {
    const result = buildServerAccessUrl({
      url: "http://127.0.0.1:4096/?embed_session=session123",
    })
    expect(result).toBe("http://127.0.0.1:4096/?embed_session=session123")
  })

  test("uses display url when present", () => {
    const result = buildServerAccessUrl({
      url: "http://127.0.0.1:4096",
      displayUrl: "http://190.160.7.95:4096",
      password: "secret",
    })

    expect(result).toBe("http://190.160.7.95:4096/?auth_token=d2lzY29kZTpzZWNyZXQ%3D")
  })
})
