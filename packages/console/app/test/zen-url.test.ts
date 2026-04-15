import { afterEach, describe, expect, test } from "bun:test"
import { workspaceUrl } from "../src/routes/zen/util/url"

const env = process.env.WISCODE_SITE_URL

describe("workspaceUrl", () => {
  afterEach(() => {
    if (env === undefined) {
      delete process.env.WISCODE_SITE_URL
      return
    }
    process.env.WISCODE_SITE_URL = env
  })

  test("uses configured wiscode site for workspace links", () => {
    process.env.WISCODE_SITE_URL = "https://wiscode.example.com/"
    expect(workspaceUrl("wrk_123", "billing")).toBe("https://wiscode.example.com/workspace/wrk_123/billing")
    expect(workspaceUrl("wrk_123", "members")).toBe("https://wiscode.example.com/workspace/wrk_123/members")
  })

  test("falls back to default site when env is unset", () => {
    delete process.env.WISCODE_SITE_URL
    expect(workspaceUrl("wrk_123", "billing")).toBe("https://opencode.ai/workspace/wrk_123/billing")
  })
})
