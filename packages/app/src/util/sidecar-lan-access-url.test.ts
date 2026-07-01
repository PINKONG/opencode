import { describe, expect, test } from "bun:test"
import { buildSidecarLanAccessUrl } from "./sidecar-lan-access-url"

describe("buildSidecarLanAccessUrl", () => {
  test("uses LAN address with sidecar credentials", () => {
    expect(
      buildSidecarLanAccessUrl(
        {
          url: "http://127.0.0.1:4096",
          username: "opencode",
          password: "secret",
        },
        "http://190.160.9.212:59583",
      ),
    ).toBe("http://190.160.9.212:59583/?auth_token=b3BlbmNvZGU6c2VjcmV0")
  })
})
