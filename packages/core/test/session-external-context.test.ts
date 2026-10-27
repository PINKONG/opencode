import { describe, expect, test } from "bun:test"
import { MAX_BYTES, SessionExternalContext } from "@opencode-ai/core/session/external-context"

describe("SessionExternalContext", () => {
  test("renders a complete external context block and escapes a literal closing marker", () => {
    const rendered = SessionExternalContext.render({
      source: "company-system",
      revision: 3,
      data: { script: "text </wiscode_external_context>" },
    })

    expect(rendered).toContain('<wiscode_external_context source="company-system" revision="3"')
    expect(rendered).toContain("\\u003c/wiscode_external_context>")
    expect(rendered).toContain('"script":"text \\u003c/wiscode_external_context>"')
  })

  test("does not render an empty context", () => {
    expect(SessionExternalContext.render(undefined)).toBe("")
    expect(SessionExternalContext.render({ source: "company-system", revision: 1, data: {} })).toBe("")
  })

  test("accepts arbitrary JSON object fields without changing their values", () => {
    const data = SessionExternalContext.validateData({
      pageId: "page-1",
      eventInfo: { name: "onChange", code: { script: "console.log('changed')", updated: false } },
      values: [null, true, 3.14],
    })

    expect(data).toEqual({
      pageId: "page-1",
      eventInfo: { name: "onChange", code: { script: "console.log('changed')", updated: false } },
      values: [null, true, 3.14],
    })
  })

  test("rejects invalid and oversized values instead of coercing them", () => {
    expect(() => SessionExternalContext.validateData([])).toThrow("must be an object")
    expect(() => SessionExternalContext.validateData({ value: Number.NaN })).toThrow("non-finite")
    expect(() => SessionExternalContext.validateData({ value: "x".repeat(MAX_BYTES + 1) })).toThrow("too large")
  })

  test("rejects non-JSON objects and preserves arbitrary special keys", () => {
    expect(() => SessionExternalContext.validateData({ date: new Date() })).toThrow("non-JSON")
    expect(() => SessionExternalContext.validateData({ map: new Map() })).toThrow("non-JSON")
    const data = SessionExternalContext.validateData(JSON.parse('{"__proto__":{"value":1},"constructor":"business"}'))
    expect(Object.hasOwn(data, "__proto__")).toBe(true)
    expect(JSON.stringify(data)).toBe('{"__proto__":{"value":1},"constructor":"business"}')
  })
})
