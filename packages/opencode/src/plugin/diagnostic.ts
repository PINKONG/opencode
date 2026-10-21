import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Effect } from "effect"

export async function observePluginHook(input: {
  diagnostics: Pick<DiagnosticTrace.Interface, "emit" | "complete">
  context?: DiagnosticTrace.TraceContext
  pluginId: string
  hook: string
  input: unknown
  output: unknown
  execute: () => Promise<void>
}) {
  const started = performance.now()
  await Effect.runPromise(input.diagnostics.emit(input.context, "plugin.hook.started", {
    summary: { pluginId: input.pluginId, hook: input.hook, inputType: typeof input.input },
    raw: () => ({ input: input.input, output: input.output }),
  })).catch(() => undefined)
  try {
    await input.execute()
    await Effect.runPromise(input.diagnostics.complete(input.context, "plugin.hook.completed", {
      summary: { pluginId: input.pluginId, hook: input.hook, outputType: typeof input.output },
      raw: () => ({ output: input.output }),
    }, { durationMs: performance.now() - started })).catch(() => undefined)
  } catch (error) {
    await Effect.runPromise(input.diagnostics.complete(input.context, "plugin.hook.failed", {
      summary: { pluginId: input.pluginId, hook: input.hook, error: DiagnosticTrace.errorInfo(error, "plugin") },
      raw: () => ({ input: input.input, output: input.output, error }),
    }, { status: "failed", durationMs: performance.now() - started })).catch(() => undefined)
    throw error
  }
}
