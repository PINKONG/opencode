import { describe, expect, test } from "bun:test"
import { iconViewBox } from "./icon"

describe("icon viewBox", () => {
  test("uses the source aspect ratio for maxkb", () => {
    expect(iconViewBox("maxkb")).toBe("0 0 28 21")
  })

  test("keeps existing special-case magnifying glass sizing", () => {
    expect(iconViewBox("magnifying-glass")).toBe("0 0 16 16")
  })
})
