import { expect, test } from "bun:test"
import { LLMEvent } from "@opencode-ai/llm"
import { diagnosticLLMEvent, diagnosticStreamExit } from "@/session/llm"
import { Cause, Exit } from "effect"

test("diagnostic LLM finish keeps usage and request outcome", () => {
  const result = diagnosticLLMEvent(
    LLMEvent.finish({
      reason: "stop",
      usage: { inputTokens: 21, outputTokens: 8 },
      providerMetadata: { secret: { body: "raw-only" } },
    }),
    0,
  )
  expect(result?.event).toBe("llm.request.completed")
  expect(result?.status).toBe("succeeded")
  expect(result?.summary).toMatchObject({ reason: "stop", usage: { inputTokens: 21, outputTokens: 8 } })
  expect(result?.summary).toMatchObject({ usageRole: "request-total" })
  expect(Object.getPrototypeOf(result?.summary.usage)).toBe(Object.prototype)
  expect(JSON.stringify(result?.summary)).not.toContain("raw-only")
  expect(result?.raw?.()).toMatchObject({ providerMetadata: { secret: { body: "raw-only" } } })
})

test("diagnostic LLM provider errors terminate the attempt", () => {
  const result = diagnosticLLMEvent(LLMEvent.providerError({ message: "rate limited", retryable: true }), 0)
  expect(result).toMatchObject({ event: "llm.request.failed", status: "failed" })
  expect(result?.summary).toMatchObject({ error: { message: "rate limited", retryable: true } })
})

test("diagnostic LLM chunks keep content behind the raw supplier", () => {
  const result = diagnosticLLMEvent(LLMEvent.textDelta({ id: "text-1", text: "secret" }), 3)
  expect(result).toMatchObject({ event: "llm.stream.chunk", summary: { index: 3, kind: "text", contentBytes: 6 } })
  expect(JSON.stringify(result?.summary)).not.toContain("secret")
  expect(result?.raw?.()).toMatchObject({ content: "secret" })
})

test("diagnostic LLM step finish keeps the billed usage separately from stream totals", () => {
  const result = diagnosticLLMEvent(
    LLMEvent.stepFinish({ index: 2, reason: "stop", usage: { inputTokens: 11, outputTokens: 4 } }),
    0,
  )
  expect(result).toBeUndefined()
})

test("provider stream without finish is a failure, while interruption is cancellation", () => {
  expect(diagnosticStreamExit(Exit.succeed(undefined))).toMatchObject({ event: "llm.request.failed", status: "failed" })
  expect(diagnosticStreamExit(Exit.failCause(Cause.interrupt()))).toMatchObject({
    event: "llm.request.cancelled",
    status: "cancelled",
  })
})
