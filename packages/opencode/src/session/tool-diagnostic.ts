import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Effect } from "effect"

export async function observeTool<T>(input: {
  diagnostics: Pick<DiagnosticTrace.Interface, "emit" | "complete">
  context: DiagnosticTrace.TraceContext
  activeTurn?: () => DiagnosticTrace.TraceContext
  name: string
  kind: "builtin" | "plugin" | "mcp" | "provider"
  callID: string
  permission?: () => { requested: boolean; decision: string }
  args: unknown
  abort?: AbortSignal
  execute: () => Promise<T>
}) {
  const context = { ...input.context, ...input.activeTurn?.(), toolCallId: input.callID }
  const started = performance.now()
  const knowledgeQuery = input.kind === "mcp" && /_search_(knowledge|dataset)$/.test(input.name)
  const parentLink = input.name === "task" ? { parentSessionId: context.sessionId, parentTraceId: context.traceId } : {}
  await Effect.runPromise(
    input.diagnostics.emit(context, "tool.started", {
      summary: {
        name: input.name,
        toolKind: input.kind,
        inputType: typeof input.args,
        permission: { requested: false, decision: "not-requested" },
        ...parentLink,
      },
      raw: () => ({ input: input.args }),
    }),
  ).catch(() => undefined)
  if (knowledgeQuery)
    await Effect.runPromise(
      input.diagnostics.emit(context, "knowledge.query.started", {
        summary: { source: "maxkb", toolName: input.name, inputType: typeof input.args },
        raw: () => ({ input: input.args }),
      }),
    ).catch(() => undefined)
  try {
    const result = await input.execute()
    const metadata = result !== null && typeof result === "object" && "metadata" in result ? result.metadata : undefined
    const childLink =
      input.name === "task" && metadata !== null && typeof metadata === "object"
        ? {
            ...("sessionId" in metadata && typeof metadata.sessionId === "string"
              ? { childSessionId: metadata.sessionId }
              : {}),
            ...("childTraceId" in metadata && typeof metadata.childTraceId === "string"
              ? { childTraceId: metadata.childTraceId }
              : {}),
          }
        : {}
    const cancelled = input.abort?.aborted ?? false
    await Effect.runPromise(
      input.diagnostics.complete(
        context,
        cancelled ? "tool.cancelled" : "tool.completed",
        {
          summary: {
            name: input.name,
            toolKind: input.kind,
            outputType: typeof result,
            permission: input.permission?.() ?? { requested: false, decision: "not-requested" },
            ...parentLink,
            ...childLink,
          },
          raw: () => ({ output: result }),
        },
        { status: cancelled ? "cancelled" : "succeeded", durationMs: performance.now() - started },
      ),
    ).catch(() => undefined)
    if (knowledgeQuery)
      await Effect.runPromise(
        input.diagnostics.complete(
          context,
          cancelled ? "knowledge.query.cancelled" : "knowledge.query.completed",
          {
            summary: { source: "maxkb", toolName: input.name, outputType: typeof result },
            raw: () => ({ output: result }),
          },
          { status: cancelled ? "cancelled" : "succeeded", durationMs: performance.now() - started },
        ),
      ).catch(() => undefined)
    return result
  } catch (error) {
    const cancelled = input.abort?.aborted ?? false
    await Effect.runPromise(
      input.diagnostics.complete(
        context,
        cancelled ? "tool.cancelled" : "tool.failed",
        {
          summary: {
            name: input.name,
            toolKind: input.kind,
            error: DiagnosticTrace.errorInfo(error, "tool"),
            permission: input.permission?.() ?? { requested: false, decision: "not-requested" },
            ...parentLink,
          },
          raw: () => ({ input: input.args, error }),
        },
        { status: cancelled ? "cancelled" : "failed", durationMs: performance.now() - started },
      ),
    ).catch(() => undefined)
    if (knowledgeQuery)
      await Effect.runPromise(
        input.diagnostics.complete(
          context,
          cancelled ? "knowledge.query.cancelled" : "knowledge.query.failed",
          {
            summary: { source: "maxkb", toolName: input.name, error: DiagnosticTrace.errorInfo(error, "knowledge") },
            raw: () => ({ input: input.args, error }),
          },
          { status: cancelled ? "cancelled" : "failed", durationMs: performance.now() - started },
        ),
      ).catch(() => undefined)
    throw error
  }
}
