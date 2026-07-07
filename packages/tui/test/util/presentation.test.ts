import { expect, test } from "bun:test"
import stripAnsi from "strip-ansi"
import { logo } from "../../src/logo"
import { sessionEpilogue } from "../../src/util/presentation"

test("formats session continuation summary", () => {
  const epilogue = sessionEpilogue({ title: "A session", sessionID: "ses_123" })
  const plain = stripAnsi(epilogue)

  expect(epilogue).toContain("A session")
  expect(epilogue).toContain("wiscode -s ses_123")
  expect(plain).not.toContain("opencode")
  expect(plain).toContain(logo.left[1].trim())
})
