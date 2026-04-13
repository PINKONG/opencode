import { describe, expect, test } from "bun:test"
import { logo } from "../../src/cli/logo"

describe("cli logo", () => {
  test("uses WisCode wordmark on the home screen", () => {
    expect(logo.left).toEqual([
      "█   █ █ █▀▀▀",
      "█ █ █ █ ▀▀▀█",
      "█▄▀▄█ █ █▄▄█",
      "▀   ▀ ▀ ▀▀▀▀",
    ])

    expect(logo.right).toEqual([
      "█▀▀▀ █▀▀█ █▀▀▄ █▀▀▀",
      "█    █  █ █  █ █▀▀ ",
      "█▄▄▄ █▄▄█ █▄▄▀ █▄▄▄",
      "▀▀▀▀ ▀▀ ▀ ▀ ▀▀ ▀▀▀▀",
    ])
  })
})
