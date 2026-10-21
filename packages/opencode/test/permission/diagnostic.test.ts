import { expect, test } from "bun:test"
import { permissionDiagnostic } from "@/permission"

test("permission diagnostic identifies a denied tool call", () => {
  expect(permissionDiagnostic({ permission: "read", pattern: "/secret", action: "deny", callID: "call_1" }))
    .toEqual({ event: "processing.phase.failed", status: "failed", summary: { phase: "permission-check", permission: "read", pattern: "/secret", decision: "deny", callID: "call_1" } })
})

test("permission diagnostic identifies automatic allowance", () => {
  expect(permissionDiagnostic({ permission: "read", pattern: "*", action: "allow" }))
    .toMatchObject({ event: "processing.phase.completed", status: "succeeded", summary: { decision: "allow" } })
})
