import { describe, expect, test } from "bun:test"
import { shouldUsePlatformEventFetch } from "./global-sdk"

describe("shouldUsePlatformEventFetch", () => {
  test("does not use platform fetch for loopback sidecar event streams", () => {
    expect(
      shouldUsePlatformEventFetch({
        platformFetch: fetch,
        server: {
          type: "sidecar",
          http: {
            url: "http://127.0.0.1:53796",
          },
        },
      }),
    ).toBe(false)
  })

  test("uses platform fetch for non-loopback plain http servers", () => {
    expect(
      shouldUsePlatformEventFetch({
        platformFetch: fetch,
        server: {
          type: "http",
          http: {
            url: "http://190.160.9.196:53796",
          },
        },
      }),
    ).toBe(true)
  })
})
