import { expect, test } from "bun:test"
import { DiagnosticReader } from "@opencode-ai/core/diagnostic-reader"
import { Diagnostic } from "@opencode-ai/schema"
import { renderDiagnosticRow } from "../../src/cli/cmd/diagnostic-format"

test("step row leads with billed tokens and keeps long IDs out of default output", () => {
  const row = {
    schema: "wiscode.diagnostic", schemaVersion: 1, seq: 0, eventId: Diagnostic.EventID.make("evt_example"),
    event: "llm.step.completed", status: "succeeded", timestamp: "2026-10-20T10:00:00.000Z",
    monotonicMs: 1, sessionId: "ses_example", traceId: Diagnostic.TraceID.make("trace_example"),
    summary: {
      messageId: "msg_very_long_assistant_identifier", partId: "prt_very_long_part_identifier",
      usageRole: "step-billed", step: 0, reason: "stop",
      usage: { inputTokens: 28051, outputTokens: 93, cacheReadInputTokens: 20, cost: { amount: 0.012, currency: "USD", estimated: true } },
    },
    source: "/tmp/2026-10-20/ses_example.jsonl", offset: 0,
  } as DiagnosticReader.Row
  const output = renderDiagnosticRow(row)
  expect(output).toContain("in=28051")
  expect(output).toContain("out=93")
  expect(output).toContain("cacheRead=20")
  expect(output).toContain("cost=0.012")
  expect(output).not.toContain("msg_very_long")
  expect(output.split("\n")).toHaveLength(1)
})

test("default row is bounded to terminal width and remains a single line", () => {
  const row = {
    schema: "wiscode.diagnostic", schemaVersion: 1, seq: 0, eventId: Diagnostic.EventID.make("evt_example"),
    event: "plugin.loaded", status: "succeeded", timestamp: "2026-10-20T10:00:00.000Z",
    monotonicMs: 1, summary: { pluginId: "x".repeat(300), source: "line\nnext" },
    source: "/tmp/2026-10-20/instance.jsonl", offset: 0,
  } as DiagnosticReader.Row
  const output = renderDiagnosticRow(row)
  expect(output.length).toBeLessThanOrEqual(160)
  expect(output).not.toContain("\n")
})
