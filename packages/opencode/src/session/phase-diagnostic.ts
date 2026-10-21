import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Cause, Effect } from "effect"

export function observePhase<A, E, R>(input: {
  diagnostics: Pick<DiagnosticTrace.Interface, "emit" | "complete">
  context: DiagnosticTrace.TraceContext
  phase: string
  step: number
  run: Effect.Effect<A, E, R>
  summarize: (result: A) => Record<string, unknown>
}) {
  return Effect.gen(function* () {
    const started = performance.now()
    yield* input.diagnostics.emit(input.context, "processing.phase.started", {
      summary: { phase: input.phase, step: input.step },
    })
    const result = yield* input.run.pipe(
      Effect.tapCause((cause) =>
        input.diagnostics.complete(
          input.context,
          "processing.phase.failed",
          {
            summary: {
              phase: input.phase,
              step: input.step,
              error: DiagnosticTrace.errorInfo(Cause.squash(cause), "processing"),
            },
          },
          { status: "failed", durationMs: performance.now() - started },
        ),
      ),
    )
    yield* input.diagnostics.complete(
      input.context,
      "processing.phase.completed",
      {
        summary: { phase: input.phase, step: input.step, ...input.summarize(result) },
      },
      { status: "succeeded", durationMs: performance.now() - started },
    )
    return result
  })
}
