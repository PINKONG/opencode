import { expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { DiagnosticReader } from "@opencode-ai/core/diagnostic-reader"

const row = (input: {
  id: string
  timestamp: string
  sessionId?: string
  traceId?: string
  parentTraceId?: string
  seq?: number
  event?: string
  summary?: Record<string, unknown>
}) => ({
  schema: "wiscode.diagnostic",
  schemaVersion: 1,
  seq: input.seq ?? 0,
  eventId: input.id,
  event: input.event ?? "task.started",
  status: "started",
  timestamp: input.timestamp,
  monotonicMs: 1,
  ...(input.sessionId ? { sessionId: input.sessionId } : {}),
  ...(input.traceId ? { traceId: input.traceId } : {}),
  ...(input.parentTraceId ? { parentTraceId: input.parentTraceId } : {}),
  payload: { summary: input.summary ?? {} },
})

test("global snapshot selects exact latest events across streams", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_a.jsonl"), [
      row({ id: "evt_late", timestamp: "2026-10-20T12:00:00.000Z", sessionId: "ses_a", seq: 0 }),
      row({ id: "evt_early", timestamp: "2026-10-20T09:00:00.000Z", sessionId: "ses_a", seq: 1 }),
    ].map((item) => JSON.stringify(item)).join("\n") + "\n")
    await fs.writeFile(path.join(dir, "ses_b.jsonl"), JSON.stringify(row({
      id: "evt_middle", timestamp: "2026-10-20T11:00:00.000Z", sessionId: "ses_b",
    })) + "\n")
    const result = await DiagnosticReader.snapshot(root, { limit: 2 })
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_middle", "evt_late"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("session view selects by recorded order across numeric volumes", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    for (const [volume, id] of [["", "evt_0"], [".2", "evt_2"], [".10", "evt_10"]])
      await fs.writeFile(path.join(dir, `ses_a${volume}.jsonl`), JSON.stringify(row({
        id, timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_a",
      })) + "\n")
    const result = await DiagnosticReader.snapshot(root, { session: "ses_a", limit: 2 })
    expect(result.exists).toBe(true)
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_2", "evt_10"])
    expect((await DiagnosticReader.snapshot(root, { session: "ses_missing", limit: 2 })).exists).toBe(false)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("session view uses the writer's encoded filename", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_space%20name.jsonl"), JSON.stringify(row({
      id: "evt_encoded", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_space name",
    })) + "\n")
    const result = await DiagnosticReader.snapshot(root, { session: "ses_space name", limit: 10 })
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_encoded"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("trace view includes descendants but not following prompts", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    const events = [
      row({ id: "evt_parent", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_a", traceId: "trace_a" }),
      row({ id: "evt_child", timestamp: "2026-10-20T10:00:01.000Z", sessionId: "ses_b", traceId: "trace_b", parentTraceId: "trace_a" }),
      row({ id: "evt_other", timestamp: "2026-10-20T10:00:02.000Z", sessionId: "ses_c", traceId: "trace_c" }),
    ]
    for (const item of events)
      await fs.writeFile(path.join(dir, `${item.sessionId}.jsonl`), JSON.stringify(item) + "\n")
    const result = await DiagnosticReader.snapshot(root, { trace: "trace_a", limit: 10 })
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_parent", "evt_child"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("ignores an incomplete tail but rejects a malformed complete record", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    const file = path.join(dir, "instance.jsonl")
    await fs.writeFile(file, JSON.stringify(row({ id: "evt_valid", timestamp: "2026-10-20T10:00:00.000Z" })) + "\n{unfinished")
    expect((await DiagnosticReader.snapshot(root, { limit: 10 })).rows.map((item) => String(item.eventId))).toEqual(["evt_valid"])
    await fs.appendFile(file, "}\n")
    await expect(DiagnosticReader.snapshot(root, { limit: 10 })).rejects.toThrow(/instance\.jsonl:2/)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("find returns raw content only for the exact event ID", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "instance.jsonl"), JSON.stringify({
      ...row({ id: "evt_secret", timestamp: "2026-10-20T10:00:00.000Z" }),
      payload: { summary: { bytes: 10 }, raw: { providerResponse: "secret" } },
    }) + "\n")
    expect((await DiagnosticReader.find(root, "evt_secret"))?.event.payload).toMatchObject({ raw: { providerResponse: "secret" } })
    expect(await DiagnosticReader.find(root, "evt_missing")).toBeUndefined()
    expect((await DiagnosticReader.snapshot(root, { limit: 10 })).rows[0]).not.toHaveProperty("payload")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("trace remains present when only linked child records are retained", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_child.jsonl"), JSON.stringify(row({
      id: "evt_child", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_child",
      traceId: "trace_child", parentTraceId: "trace_expired",
    })) + "\n")
    const result = await DiagnosticReader.snapshot(root, { trace: "trace_expired", limit: 10 })
    expect(result.exists).toBe(true)
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_child"])
    expect(result.warnings.join(" ")).toContain("trace_expired")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("trace warns when a recorded child has no retained events", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_parent.jsonl"), JSON.stringify(row({
      id: "evt_link", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_parent",
      traceId: "trace_parent", event: "task.child.started", summary: { childTraceId: "trace_deleted" },
    })) + "\n")
    const result = await DiagnosticReader.snapshot(root, { trace: "trace_parent", limit: 10 })
    expect(result.warnings.join(" ")).toContain("trace_deleted")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("incremental poll waits for newline and reads a replacement with restarted sequence", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    const file = path.join(dir, "ses_live.jsonl")
    const first = JSON.stringify(row({ id: "evt_first", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_live" }))
    await fs.writeFile(file, first.slice(0, 20))
    const seen: string[] = []
    const visit = (item: DiagnosticReader.Row) => { seen.push(String(item.eventId)) }
    const initial = await DiagnosticReader.poll(root, new Map(), visit)
    expect(seen).toHaveLength(0)
    await fs.appendFile(file, first.slice(20) + "\n")
    const completed = await DiagnosticReader.poll(root, initial.cursors, visit)
    expect(seen).toEqual(["evt_first"])
    await fs.rm(file)
    await fs.writeFile(file, JSON.stringify(row({ id: "evt_second", timestamp: "2026-10-20T10:00:01.000Z", sessionId: "ses_live" })) + "\n")
    const reset = await DiagnosticReader.poll(root, completed.cursors, visit)
    expect(reset.resets).toEqual([file])
    expect(seen).toEqual(["evt_first", "evt_second"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("backfill retrieves retained records for a newly linked child trace", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_child.jsonl"), JSON.stringify(row({
      id: "evt_prior", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_child", traceId: "trace_child",
    })) + "\n")
    const result: string[] = []
    await DiagnosticReader.backfill(root, new Set(["trace_child"]), (item) => { result.push(String(item.eventId)) })
    expect(result).toEqual(["evt_prior"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("backfill skips files removed after discovery", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_a.jsonl"), JSON.stringify(row({
      id: "evt_first", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_a", traceId: "trace_child",
    })) + "\n")
    const removed = path.join(dir, "ses_b.jsonl")
    await fs.writeFile(removed, JSON.stringify(row({
      id: "evt_removed", timestamp: "2026-10-20T10:00:01.000Z", sessionId: "ses_b", traceId: "trace_child",
    })) + "\n")
    const result: string[] = []
    await DiagnosticReader.backfill(root, new Set(["trace_child"]), async (item) => {
      result.push(String(item.eventId))
      await fs.rm(removed)
    })
    expect(result).toEqual(["evt_first"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("snapshot reports scanning progress without changing selected rows", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "instance.jsonl"), JSON.stringify(row({
      id: "evt_one", timestamp: "2026-10-20T10:00:00.000Z",
    })) + "\n")
    const progress: Array<[number, number]> = []
    const result = await DiagnosticReader.snapshot(root, { limit: 10, onProgress: (files, bytes) => { progress.push([files, bytes]) } })
    expect(progress.at(-1)?.[0]).toBe(1)
    expect(progress.at(-1)?.[1]).toBeGreaterThan(0)
    expect(result.rows).toHaveLength(1)
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("snapshot bounds nested summary values while preserving usage counters", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "instance.jsonl"), JSON.stringify(row({
      id: "evt_large", timestamp: "2026-10-20T10:00:00.000Z",
      summary: {
        blob: { nested: "x".repeat(100_000) },
        usage: { inputTokens: 42, providerMetadata: { large: "y".repeat(100_000) } },
        error: { message: "z".repeat(100_000) },
      },
    })) + "\n")
    const result = await DiagnosticReader.snapshot(root, { limit: 10 })
    expect(JSON.stringify(result.rows[0].summary).length).toBeLessThan(4096)
    expect(result.rows[0].summary.usage).toMatchObject({ inputTokens: 42 })
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("filters status, event, and time before applying the latest-row limit", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    const events = [
      row({ id: "evt_old", timestamp: "2026-10-20T09:00:00.000Z", event: "tool.failed" }),
      row({ id: "evt_good", timestamp: "2026-10-20T10:00:00.000Z", event: "tool.failed" }),
      row({ id: "evt_other", timestamp: "2026-10-20T11:00:00.000Z", event: "task.failed" }),
    ].map((item, index) => ({ ...item, seq: index, status: "failed" }))
    await fs.writeFile(path.join(dir, "instance.jsonl"), events.map((item) => JSON.stringify(item)).join("\n") + "\n")
    const result = await DiagnosticReader.snapshot(root, {
      limit: 1, status: "failed", event: "tool.*", since: "2026-10-20T10:00:00.000Z",
    })
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_good"])
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})

test("snapshot warns and continues if retention deletes a discovered file", async () => {
  const root = await fs.mkdtemp(path.join(os.tmpdir(), "diagnostic-reader-"))
  try {
    const dir = path.join(root, "2026-10-20")
    await fs.mkdir(dir)
    await fs.writeFile(path.join(dir, "ses_a.jsonl"), JSON.stringify(row({
      id: "evt_kept", timestamp: "2026-10-20T10:00:00.000Z", sessionId: "ses_a",
    })) + "\n")
    const removed = path.join(dir, "ses_b.jsonl")
    await fs.writeFile(removed, JSON.stringify(row({
      id: "evt_removed", timestamp: "2026-10-20T11:00:00.000Z", sessionId: "ses_b",
    })) + "\n")
    const result = await DiagnosticReader.snapshot(root, {
      limit: 10,
      onProgress: async (files) => { if (files === 1) await fs.rm(removed) },
    })
    expect(result.rows.map((item) => String(item.eventId))).toEqual(["evt_kept"])
    expect(result.warnings.join(" ")).toContain("partial")
  } finally {
    await fs.rm(root, { recursive: true, force: true })
  }
})
