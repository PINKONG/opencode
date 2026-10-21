import { describe, expect, test } from "bun:test"
import { Schema } from "effect"
import { Envelope, Phase, QuerySource, SessionEngine, Status } from "../src/diagnostic"

const envelope = {
  schema: "wiscode.diagnostic",
  schemaVersion: 1,
  seq: 0,
  eventId: "evt_01",
  event: "future.event.name",
  status: "succeeded",
  timestamp: "2026-10-20T14:32:01.123Z",
  monotonicMs: 123.5,
  payload: { nested: ["value", 1, { enabled: true }] },
} as const

describe("Diagnostic contract", () => {
  test("decodes a minimal envelope and omits absent optional fields on encode", () => {
    const decoded = Schema.decodeUnknownSync(Envelope)(envelope)

    expect(decoded).toMatchObject(envelope)
    expect(Schema.encodeSync(Envelope)(decoded)).toEqual(envelope)
  })

  test("allows every optional association field to be omitted", () => {
    expect(Schema.decodeUnknownSync(Envelope)(envelope)).not.toHaveProperty("sessionId")
    expect(Schema.decodeUnknownSync(Envelope)(envelope)).not.toHaveProperty("durationMs")
  })

  test("accepts only the declared lifecycle statuses", () => {
    for (const status of ["started", "succeeded", "failed", "cancelled", "dropped"] as const) {
      expect(Schema.decodeUnknownSync(Status)(status)).toBe(status)
    }
    expect(() => Schema.decodeUnknownSync(Status)("retrying")).toThrow()
  })

  test("keeps query sources closed and excludes retry", () => {
    for (const source of ["main", "subagent", "title", "summary", "compaction", "auxiliary"] as const) {
      expect(Schema.decodeUnknownSync(QuerySource)(source)).toBe(source)
    }
    expect(() => Schema.decodeUnknownSync(QuerySource)("retry")).toThrow()
  })

  test("keeps engine values stable while event and phase names stay open", () => {
    expect(Schema.decodeUnknownSync(SessionEngine)("legacy-v1")).toBe("legacy-v1")
    expect(Schema.decodeUnknownSync(SessionEngine)("session-v2")).toBe("session-v2")
    expect(() => Schema.decodeUnknownSync(SessionEngine)("legacy-v2")).toThrow()
    expect(Schema.decodeUnknownSync(Envelope)({ ...envelope, event: "future.event" }).event).toBe("future.event")
    expect(Schema.decodeUnknownSync(Phase)("future-phase")).toBe("future-phase")
  })

  test("preserves unknown payload fields and arbitrary JSON values", () => {
    const value = {
      ...envelope,
      payload: { addedLater: { flags: [false, null, 42] }, text: "round trip" },
    }
    const decoded = Schema.decodeUnknownSync(Envelope)(value)

    expect(Schema.encodeSync(Envelope)(decoded)).toEqual(value)
  })
})
