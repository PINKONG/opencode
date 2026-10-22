import { DiagnosticReader } from "@opencode-ai/core/diagnostic-reader"
import { Diagnostic } from "@opencode-ai/schema"

export function renderDiagnosticRow(row: DiagnosticReader.Row, options: { ids?: boolean; utc?: boolean } = {}) {
  const date = new Date(row.timestamp)
  const timestamp = options.utc
    ? date.toISOString().replace("T", " ")
    : `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())} ${pad(date.getHours())}:${pad(date.getMinutes())}:${pad(date.getSeconds())}.${String(date.getMilliseconds()).padStart(3, "0")} ${date.getTimezoneOffset() <= 0 ? "+" : "-"}${pad(Math.floor(Math.abs(date.getTimezoneOffset()) / 60))}:${pad(Math.abs(date.getTimezoneOffset()) % 60)}`
  const level = row.status === "failed" ? "ERROR" : row.status === "cancelled" || row.status === "dropped" ? "WARN" : "INFO"
  const session = row.sessionId ? abbreviate(row.sessionId) : "(inst)"
  const details = summary(row)
  const ids = options.ids ? ` eventId=${row.eventId} sessionId=${row.sessionId ?? "-"} traceId=${row.traceId ?? "-"} turnId=${row.turnId ?? "-"} source=${row.source}` : ""
  const line = `${timestamp} ${session.padEnd(13)} ${level.padEnd(5)} ${row.event.padEnd(24)} ${row.status.padEnd(10)} ${row.durationMs === undefined ? "" : `${Math.round(row.durationMs)}ms `}${details}${ids}`.trimEnd()
  const width = process.stdout.columns ?? 160
  return !options.ids && line.length > width ? `${line.slice(0, Math.max(0, width - 3))}...` : line
}

function summary(row: DiagnosticReader.Row) {
  const llmUsage = row.event === "llm.step.completed" || row.event === "llm.request.completed"
  const fields = row.event === "llm.step.completed"
    ? ["step", "reason"]
    : row.event === "llm.request.started"
      ? ["provider", "model", "querySource", "attempt", "messageCount", "toolCount"]
      : row.event === "llm.request.completed"
        ? ["reason", "querySource", "attempt"]
        : row.event.startsWith("tool.")
          ? ["name", "toolKind", "stage"]
          : row.event.startsWith("task.")
            ? ["agent", "model", "childTraceId"]
            : Object.keys(row.summary).filter((key) => !/^(messageId|partId|userMessageId|traceId|parentTraceId)$/.test(key)).slice(0, 5)
  const pairs = fields.flatMap((key) => {
    const value = row.summary[key]
    if (value === null || value === undefined || typeof value === "object") return []
    return [`${key}=${String(value).replace(/[\r\n\t]/g, " ").slice(0, 80)}`]
  })
  const usagePairs: string[] = []
  const usage = row.summary.usage
  if (usage && typeof usage === "object" && !Array.isArray(usage)) {
    const values = usage as Record<string, unknown>
    for (const [key, label] of [["inputTokens", "in"], ["outputTokens", "out"], ["cacheReadInputTokens", "cacheRead"], ["cacheWriteInputTokens", "cacheWrite"], ["reasoningTokens", "reasoning"]]) {
      if (typeof values[key] === "number") usagePairs.push(`${label}=${values[key]}`)
    }
    const cost = values.cost
    if (cost && typeof cost === "object" && "amount" in cost && typeof cost.amount === "number") usagePairs.push(`cost=${cost.amount}`)
  }
  return (llmUsage ? [...usagePairs, ...pairs] : [...pairs, ...usagePairs]).join(" ")
}

export function renderDiagnosticEvent(event: Diagnostic.Envelope, options: { raw?: boolean; content?: boolean } = {}) {
  const { payload, ...envelope } = event
  const content = payload as { summary?: unknown; raw?: unknown; content?: Record<string, unknown> }
  if (options.content) return JSON.stringify(content.content ?? null, null, 2)
  return JSON.stringify({
    ...envelope,
    summary: content.summary,
    ...(!options.raw && content.content ? {
      contentSummary: {
        kind: content.content.kind,
        bytes: Buffer.byteLength(JSON.stringify(content.content), "utf8"),
        ...(Array.isArray(content.content.messages) ? { messageCount: content.content.messages.length } : {}),
        ...(Array.isArray(content.content.tools) ? { toolCount: content.content.tools.length } : {}),
        ...(typeof content.content.complete === "boolean" ? { complete: content.content.complete } : {}),
      },
    } : {}),
    ...(options.raw && content.raw !== undefined ? { raw: formatRaw(content.raw) } : {}),
  }, null, 2)
}

function formatRaw(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(formatRaw)
  if (!value || typeof value !== "object") return value
  return Object.fromEntries(Object.entries(value).map(([key, item]) => [
    key,
    key === "body" && typeof item === "string" && /^(?:data:|:)/m.test(item)
      ? { sseFrames: parseSSE(item) }
      : formatRaw(item),
  ]))
}

function parseSSE(body: string) {
  const frames: { data?: unknown; comments?: string[]; fields?: string[] }[] = []
  let lines: string[] = []
  const flush = () => {
    if (!lines.length) return
    const data = lines.filter((line) => line.startsWith("data:")).map((line) => line.slice(5).trimStart()).join("\n")
    let parsed: unknown = data
    if (data && data !== "[DONE]") {
      try { parsed = JSON.parse(data) } catch { parsed = data }
    }
    frames.push({
      ...(data ? { data: parsed } : {}),
      ...((lines.some((line) => line.startsWith(":"))) ? { comments: lines.filter((line) => line.startsWith(":")) } : {}),
      ...((lines.some((line) => !line.startsWith("data:") && !line.startsWith(":")))
        ? { fields: lines.filter((line) => !line.startsWith("data:") && !line.startsWith(":")) } : {}),
    })
    lines = []
  }
  for (const line of body.split(/\r?\n/)) {
    if (!line) flush()
    else lines.push(line)
  }
  flush()
  return frames
}

function pad(value: number) {
  return String(value).padStart(2, "0")
}

function abbreviate(value: string) {
  return value.length <= 13 ? value : `${value.slice(0, 5)}...${value.slice(-5)}`
}
