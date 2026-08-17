import { describe, expect, test } from "bun:test"
import { getUpdaterFeedURL } from "./updater-feed"

describe("self-hosted updater feed", () => {
  test("maps Electron platforms and architectures to MoreCloud targets", () => {
    expect(getUpdaterFeedURL("prod", "win32", "x64")).toBe(
      "https://cloud.morewis.com/api/frontend/wiscode/updates/prod/windows/x64",
    )
    expect(getUpdaterFeedURL("beta", "darwin", "arm64")).toBe(
      "https://cloud.morewis.com/api/frontend/wiscode/updates/beta/macos/arm64",
    )
    expect(getUpdaterFeedURL("prod", "linux", "arm64")).toBe(
      "https://cloud.morewis.com/api/frontend/wiscode/updates/prod/linux/arm64",
    )
  })

  test("rejects unsupported platforms", () => {
    expect(() => getUpdaterFeedURL("prod", "freebsd", "x64")).toThrow("Unsupported updater platform: freebsd")
  })

  test("rejects unsupported architectures", () => {
    expect(() => getUpdaterFeedURL("prod", "linux", "ia32")).toThrow("Unsupported updater architecture: ia32")
  })
})
