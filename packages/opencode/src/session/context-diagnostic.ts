import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Effect } from "effect"

export function recordContextSources(
  diagnostics: Pick<DiagnosticTrace.Interface, "emit">,
  context: DiagnosticTrace.TraceContext,
  sources: ReadonlyArray<{ kind: "skill" | "reference" | "system" | "agent" | "mcp"; id: string; content: string }>,
) {
  return Effect.forEach(sources, (source) => diagnostics.emit(context, "context.source.loaded", {
    summary: { sourceKind: source.kind, sourceId: source.id, contentBytes: Buffer.byteLength(source.content, "utf8") },
    raw: () => ({ content: source.content }),
  }), { discard: true })
}
