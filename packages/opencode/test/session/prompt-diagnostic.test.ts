import { expect, test } from "bun:test"
import { diagnosticTaskOutcome, diagnosticCauseOutcome, diagnosticParentLink, PromptInput, CommandInput } from "@/session/prompt"
import { Cause, Schema } from "effect"
import { Diagnostic } from "@opencode-ai/schema"

test("prompt and command admission preserve an explicit diagnostic surface", () => {
  const prompt = Schema.decodeUnknownSync(PromptInput)({
    sessionID: "ses_diagnostic_surface", parts: [{ type: "text", text: "hello" }], diagnosticSurface: "desktop",
  })
  const command = Schema.decodeUnknownSync(CommandInput)({
    sessionID: "ses_diagnostic_surface", command: "help", arguments: "", diagnosticSurface: "acp",
  })
  expect((prompt as { diagnosticSurface?: string }).diagnosticSurface).toBe("desktop")
  expect((command as { diagnosticSurface?: string }).diagnosticSurface).toBe("acp")
})

test("subagent linkage identifies both sessions, trace IDs, and the parent tool call", () => {
  const parent = { sessionId: "ses_parent", traceId: Diagnostic.TraceID.make("trace_parent"), runtime: { sessionEngine: "legacy-v1" as const } }
  expect(diagnosticParentLink(parent, "ses_child", "call_task")).toEqual({
    parentTraceId: parent.traceId,
    parentSessionId: "ses_parent",
    childSessionId: "ses_child",
    toolCallId: "call_task",
  })
  expect(diagnosticParentLink(parent, "ses_parent", "call_task")).toBeUndefined()
})

test("diagnostic task outcome distinguishes assistant success", () => {
  expect(diagnosticTaskOutcome(undefined)).toEqual({ event: "task.completed", status: "succeeded" })
})

test("diagnostic task outcome classifies a cancelled assistant", () => {
  expect(diagnosticTaskOutcome({ name: "MessageAbortedError" })).toEqual({ event: "task.cancelled", status: "cancelled" })
})

test("diagnostic task outcome classifies an assistant error", () => {
  expect(diagnosticTaskOutcome({ name: "ProviderAuthError" })).toEqual({ event: "task.failed", status: "failed" })
})

test("diagnostic cause outcome classifies interruption as cancellation", () => {
  expect(diagnosticCauseOutcome(Cause.interrupt()).status).toBe("cancelled")
})
