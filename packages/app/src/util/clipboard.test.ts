import { afterEach, beforeEach, describe, expect, mock, test } from "bun:test"
import { writeClipboard } from "./clipboard"

const originalClipboard = navigator.clipboard
const originalExec = document.execCommand

beforeEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: {
      writeText: mock(() => Promise.resolve()),
    },
  })
  document.execCommand = mock(() => true)
})

afterEach(() => {
  Object.defineProperty(navigator, "clipboard", {
    configurable: true,
    value: originalClipboard,
  })
  document.execCommand = originalExec
})

describe("writeClipboard", () => {
  test("prefers navigator clipboard when available", async () => {
    const writeText = mock(() => Promise.resolve())
    Object.defineProperty(navigator, "clipboard", {
      configurable: true,
      value: { writeText },
    })
    const exec = mock(() => true)
    document.execCommand = exec

    await expect(writeClipboard("hello")).resolves.toBe(true)
    expect(writeText).toHaveBeenCalledWith("hello")
    expect(exec).not.toHaveBeenCalled()
  })
})
