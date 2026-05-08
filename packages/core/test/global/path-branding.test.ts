import { describe, expect, test } from "bun:test"
import path from "node:path"
import { Global } from "../../src/global"

describe("global path branding", () => {
  test("uses wiscode namespace for global directories", () => {
    expect(path.basename(Global.Path.config)).toBe("wiscode")
    expect(path.basename(Global.Path.data)).toBe("wiscode")
    expect(path.basename(Global.Path.cache)).toBe("wiscode")
    expect(path.basename(Global.Path.state)).toBe("wiscode")
  })
})
