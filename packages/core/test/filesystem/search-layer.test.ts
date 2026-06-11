import { describe, expect, test } from "bun:test"
import { resolveDefaultSearchImplementation } from "../../src/filesystem/search-layer"

describe("resolveDefaultSearchImplementation", () => {
  test("falls back to ripgrep when FFF is unavailable even if not explicitly disabled", () => {
    expect(
      resolveDefaultSearchImplementation({
        disableFff: false,
        fffAvailable: false,
      }),
    ).toBe("ripgrep")
  })

  test("keeps the explicit disable switch authoritative", () => {
    expect(
      resolveDefaultSearchImplementation({
        disableFff: true,
        fffAvailable: true,
      }),
    ).toBe("ripgrep")
  })

  test("uses FFF only when available and not disabled", () => {
    expect(
      resolveDefaultSearchImplementation({
        disableFff: false,
        fffAvailable: true,
      }),
    ).toBe("fff")
  })
})
