import { describe, expect, test } from "bun:test"
import { safeSessionSync } from "./session-sync"

describe("safeSessionSync", () => {
  test("returns the sync result when the request succeeds", async () => {
    const value = await safeSessionSync(() => Promise.resolve("ok"))
    expect(value).toBe("ok")
  })

  test("returns undefined and reports non-abort failures", async () => {
    const errors: unknown[] = []
    const value = await safeSessionSync(
      () => Promise.reject(new Error("connection refused")),
      (error) => errors.push(error),
    )

    expect(value).toBeUndefined()
    expect(errors).toHaveLength(1)
    expect(errors[0]).toBeInstanceOf(Error)
    expect((errors[0] as Error).message).toBe("connection refused")
  })

  test("ignores abort failures", async () => {
    const errors: unknown[] = []
    const value = await safeSessionSync(
      () => Promise.reject(new DOMException("Aborted", "AbortError")),
      (error) => errors.push(error),
    )

    expect(value).toBeUndefined()
    expect(errors).toEqual([])
  })
})
