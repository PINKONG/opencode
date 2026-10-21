import { expect, test } from "bun:test"
import { Effect } from "effect"
import { observePhase } from "@/session/phase-diagnostic"

test("phase observation emits a completed event with duration and result summary", async () => {
  const events: Array<{ event: string; summary: unknown; status?: string; durationMs?: number }> = []
  const diagnostics = {
    emit: (_context: unknown, event: string, input: { summary: unknown }) =>
      Effect.sync(() => {
        events.push({ event, summary: input.summary })
      }),
    complete: (
      _context: unknown,
      event: string,
      input: { summary: unknown },
      options?: { status?: string; durationMs?: number },
    ) =>
      Effect.sync(() => {
        events.push({ event, summary: input.summary, status: options?.status, durationMs: options?.durationMs })
      }),
  }
  const result = await Effect.runPromise(
    observePhase({
      diagnostics,
      context: { sessionId: "ses_phase" },
      phase: "tool-dispatch",
      step: 2,
      run: Effect.succeed(["read", "write"]),
      summarize: (tools) => ({ toolCount: tools.length }),
    }),
  )
  expect(result).toEqual(["read", "write"])
  expect(events.map((item) => item.event)).toEqual(["processing.phase.started", "processing.phase.completed"])
  expect(events[1]).toMatchObject({ summary: { phase: "tool-dispatch", step: 2, toolCount: 2 }, status: "succeeded" })
  expect(events[1]?.durationMs).toBeGreaterThanOrEqual(0)
})

test("phase observation records failure and preserves the business error", async () => {
  const events: Array<{ event: string; summary: unknown; status?: string }> = []
  const diagnostics = {
    emit: (_context: unknown, event: string, input: { summary: unknown }) =>
      Effect.sync(() => {
        events.push({ event, summary: input.summary })
      }),
    complete: (_context: unknown, event: string, input: { summary: unknown }, options?: { status?: string }) =>
      Effect.sync(() => {
        events.push({ event, summary: input.summary, status: options?.status })
      }),
  }
  await expect(
    Effect.runPromise(
      observePhase({
        diagnostics,
        context: {},
        phase: "context-assembly",
        step: 1,
        run: Effect.fail(new Error("source unavailable")),
        summarize: () => ({}),
      }),
    ),
  ).rejects.toThrow("source unavailable")
  expect(events.map((item) => item.event)).toEqual(["processing.phase.started", "processing.phase.failed"])
  expect(events[1]).toMatchObject({
    status: "failed",
    summary: { phase: "context-assembly", error: { message: "source unavailable" } },
  })
})
