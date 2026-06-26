import { expect, test } from "bun:test"
import { logo } from "../src/logo"

test("startup logo uses WisCode branding", () => {
  expect(logo.text).toBe("wiscode")
})
