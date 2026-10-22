import fs from "fs/promises"
import path from "path"
import { describe, expect, test } from "bun:test"
import { Effect } from "effect"
import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Global } from "@opencode-ai/core/global"
import { Flock } from "@opencode-ai/core/util/flock"
import { tmpdir } from "./fixture/tmpdir"

const run = async <A>(
  root: string,
  effect: Effect.Effect<A, never, DiagnosticTrace.Service>,
  node = DiagnosticTrace.node,
) => {
  const layer = AppNodeBuilder.build(node, [
    [Global.node, Global.layerWith({ log: path.join(root, "log"), state: path.join(root, "state") })],
  ])
  return Effect.runPromise(effect.pipe(Effect.provide(layer)))
}

describe("DiagnosticTrace", () => {
  test("filters categories before summary normalization, raw evaluation, queue capacity and sequence allocation", async () => {
    await using tmp = await tmpdir()
    let summaryCalls = 0
    let rawCalls = 0
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true, rawPayloads: true, categories: ["llm"] })
      const context = service.startTask({ sessionId: "ses_categories" })
      for (const event of ["task.started", "tool.completed", "plugin.loaded", "future.event"]) {
        yield* service.emit(context, event, {
          summary: { get ignored() { summaryCalls++; return true } },
          raw: () => { rawCalls++; return "ignored" },
        })
      }
      yield* service.complete(context, "llm.request.completed", { summary: { tokens: 4 }, raw: () => "kept" })
      yield* service.flush()
    }), DiagnosticTrace.testingNode({ highCapacity: 1 }))
    const directory = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10))
    const rows = (await fs.readFile(path.join(directory, "ses_categories.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(summaryCalls).toBe(0)
    expect(rawCalls).toBe(0)
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ seq: 0, event: "llm.request.completed", payload: { raw: "kept" } })
    expect(await fs.readdir(directory)).toEqual(["ses_categories.jsonl"])
  })

  test("maps every configuration field and supplies complete defaults", () => {
    expect(DiagnosticTrace.fromConfig(undefined)).toEqual({
      enabled: false, rawPayloads: false, streaming: false, retentionDays: 14,
      maxTotalBytes: 2 * 1024 * 1024 * 1024, categories: undefined, llmContent: false,
    })
    expect(DiagnosticTrace.fromConfig({ enabled: true, rawPayloads: true, streaming: true,
      retentionDays: 7, maxTotalBytes: 4096, categories: ["llm", "tool"], llmContent: true })).toEqual({
      enabled: true, rawPayloads: true, streaming: true, retentionDays: 7, maxTotalBytes: 4096, categories: ["llm", "tool"], llmContent: true,
    })
  })

  test("writes LLM content only when enabled and leaves raw payloads independent", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true, llmContent: true })
      yield* service.emit(undefined, "llm.request.started", { summary: {}, content: { kind: "request", messages: [] } })
      yield* service.configure({ ...service.config(), llmContent: false, rawPayloads: true })
      yield* service.emit(undefined, "llm.request.started", { summary: {}, content: { kind: "request", messages: ["hidden"] }, raw: () => ({ raw: true }) })
      yield* service.flush()
    }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    const rows = (await fs.readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(rows[0].payload).toEqual({ summary: {}, content: { kind: "request", messages: [] } })
    expect(rows[1].payload).toEqual({ summary: {}, raw: { raw: true } })
  })

  test("preserves binary attachments in content without changing summary or raw normalization", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true, llmContent: true, rawPayloads: true })
      const data = new Uint8Array([0, 128, 255])
      yield* service.emit(undefined, "llm.request.started", {
        summary: { data },
        content: { messages: [{ role: "user", content: [{ type: "image", image: data }, { type: "file", data: data.buffer }] }] },
        raw: () => ({ data }),
      })
      yield* service.flush()
    }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    const payload = JSON.parse(await fs.readFile(file, "utf8")).payload
    const binary = { type: "binary", bytes: 3, encoding: "base64", data: "AID/" }
    expect(payload.content.messages[0].content).toEqual([{ type: "image", image: binary }, { type: "file", data: binary }])
    expect(payload.summary.data).toEqual({ type: "binary", bytes: 3 })
    expect(payload.raw.data).toEqual({ type: "binary", bytes: 3 })
  })

  test("copies category snapshots and restores unrestricted admission on replacement", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      const categories: ("llm" | "tool")[] = ["llm"]
      yield* service.configure({ ...service.config(), enabled: true, categories })
      categories.push("tool")
      expect(service.config().categories).toEqual(["llm"])
      yield* service.emit(undefined, "tool.started", { summary: {} })
      yield* service.emit(undefined, "llm.request.started", { summary: {} })
      yield* service.configure({ ...service.config(), categories: undefined })
      yield* service.emit(undefined, "future.event", { summary: {} })
      yield* service.flush()
    }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    expect((await fs.readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line).event))
      .toEqual(["llm.request.started", "future.event"])
  })

  test("does not normalize content when disabled or filtered and restricts it to LLM events", async () => {
    await using tmp = await tmpdir()
    let calls = 0
    const content = { get text() { calls++; return "private" } }
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true })
      yield* service.emit(undefined, "llm.request.started", { summary: { case: "disabled" }, content })
      yield* service.configure({ ...service.config(), llmContent: true, categories: ["tool"] })
      yield* service.emit(undefined, "llm.request.started", { summary: {}, content })
      yield* service.emit(undefined, "tool.started", { summary: { case: "other-family" }, content })
      yield* service.configure({ ...service.config(), categories: ["llm"] })
      yield* service.emit(undefined, "llm.request.completed", { summary: { case: "enabled" }, content })
      yield* service.flush()
    }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    const rows = (await fs.readFile(file, "utf8")).trim().split("\n").map((line) => JSON.parse(line))
    expect(calls).toBe(1)
    expect(rows.map((row) => row.payload)).toEqual([
      { summary: { case: "disabled" } },
      { summary: { case: "other-family" } },
      { summary: { case: "enabled" }, content: { text: "private" } },
    ])
  })

  test("content serialization failures retain the summary and do not fail the business effect", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true, llmContent: true })
      yield* service.emit(undefined, "llm.request.completed", {
        summary: { kept: true },
        content: { get broken() { throw new Error("content failed") } },
      })
      yield* service.flush()
    }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    expect(JSON.parse(await fs.readFile(file, "utf8")).payload).toEqual({ summary: { kept: true } })
  })

  test("keeps category and streaming admission independent", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true, categories: ["llm"] })
      yield* service.emit(undefined, "llm.stream.chunk", { summary: { index: 0 } })
      yield* service.configure({ ...service.config(), streaming: true, categories: ["tool"] })
      yield* service.emit(undefined, "llm.stream.chunk", { summary: { index: 1 } })
      yield* service.configure({ ...service.config(), categories: ["llm"] })
      yield* service.emit(undefined, "llm.stream.chunk", { summary: { index: 2 } })
      yield* service.flush()
    }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    const rows = (await fs.readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows).toHaveLength(1)
    expect(rows[0].payload.summary.index).toBe(2)
  })

  test("preserves writer drop signals under llm-only admission", async () => {
    await using tmp = await tmpdir()
    await run(tmp.path, Effect.gen(function* () {
      const service = yield* DiagnosticTrace.Service
      yield* service.configure({ ...service.config(), enabled: true, categories: ["llm"] })
      yield* service.emit(undefined, "llm.request.started", { summary: {} })
      yield* service.emit(undefined, "tool.started", { summary: {} })
      yield* service.flush()
    }), DiagnosticTrace.testingNode({ highCapacity: 0 }))
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "instance.jsonl")
    const row = JSON.parse(await fs.readFile(file, "utf8"))
    expect(row.event).toBe("diagnostic.events_dropped")
    expect(row.payload.counts).toEqual({ "llm.request.started": 1 })
  })

  test("normalizes failures with a stable stage and retryability", () => {
    const error = Object.assign(new Error("quota exceeded"), { retryable: true, providerError: { code: 429 } })
    expect(DiagnosticTrace.errorInfo(error, "provider")).toMatchObject({
      name: "Error",
      message: "quota exceeded",
      retryable: true,
      stage: "provider",
      providerError: { code: 429 },
    })
    expect(DiagnosticTrace.errorInfo("denied", "permission")).toMatchObject({
      name: "Error",
      message: "denied",
      retryable: false,
      stage: "permission",
    })
  })
  test("is disabled by default and does not create files", async () => {
    await using tmp = await tmpdir()
    const trace = await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        const context = service.startTask({ sessionId: "ses_default" })
        yield* service.emit(context, "task.started", { summary: { textLength: 4 } })
        yield* service.flush()
        return context
      }),
    )

    expect(trace.traceId).toMatch(/^trace_/)
    await expect(fs.readdir(path.join(tmp.path, "log", "diagnostics"))).rejects.toThrow()
  })

  test("creates the diagnostic root on demand", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "log", "diagnostics")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.ensureRoot()
      }),
    )

    expect((await fs.stat(root)).isDirectory()).toBe(true)
  })

  test("uses independent explicit task and turn contexts", async () => {
    await using tmp = await tmpdir()
    const [first, second] = await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        const one = service.startTask({ sessionId: "ses_one", runtime: { sessionEngine: "legacy-v1" } })
        const two = service.startTask({ sessionId: "ses_two", parentTraceId: one.traceId })
        const turn = service.startTurn(one, { attempt: 2 })
        return [turn, two] as const
      }),
    )

    expect(first.traceId).not.toBe(second.traceId)
    expect(first.sessionId).toBe("ses_one")
    expect(first.turnId).toMatch(/^turn_/)
    expect(first.attempt).toBe(2)
    expect(second.parentTraceId).toBe(first.traceId)
  })

  test("writes explicit events and does not evaluate raw payloads when disabled", async () => {
    await using tmp = await tmpdir()
    let rawCalls = 0
    const root = path.join(tmp.path, "log", "diagnostics")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        const context = service.startTask({ sessionId: "ses_enabled" })
        yield* service.configure({
          enabled: true,
          llmContent: false,
          rawPayloads: false,
          streaming: false,
          retentionDays: 14,
          maxTotalBytes: 2 * 1024 * 1024 * 1024,
          categories: undefined,
        })
        yield* service.emit(context, "task.started", {
          summary: { textLength: 4 },
          raw: () => {
            rawCalls++
            return { text: "private" }
          },
        })
        yield* service.flush(context.sessionId)
      }),
    )

    expect(rawCalls).toBe(0)
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(root, date, "ses_enabled.jsonl")
    const rows = (await fs.readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows).toHaveLength(1)
    expect(rows[0]).toMatchObject({ event: "task.started", payload: { summary: { textLength: 4 } }, seq: 0 })
    expect(rows[0].payload).not.toHaveProperty("raw")
  })

  test("omits undefined summary properties instead of inventing values", async () => {
    await using tmp = await tmpdir()
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_optional" })
        yield* service.emit(context, "task.started", { summary: { known: 1, absent: undefined } })
        yield* service.flush(context.sessionId)
      }),
    )
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "ses_optional.jsonl")
    expect(JSON.parse(await fs.readFile(file, "utf8")).payload.summary).toEqual({ known: 1 })
  })

  test("writes instance events without inventing session identifiers", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "log", "diagnostics")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        yield* service.complete(undefined, "plugin.loaded", { summary: { pluginId: "fixture" } })
        yield* service.flush()
      }),
    )

    const date = new Date().toISOString().slice(0, 10)
    const line = await fs.readFile(path.join(root, date, "instance.jsonl"), "utf8")
    const event = JSON.parse(line)
    expect(event.event).toBe("plugin.loaded")
    expect(event.status).toBe("succeeded")
    expect(event).not.toHaveProperty("sessionId")
    expect(event).not.toHaveProperty("traceId")
  })

  test("persists an explicitly supplied tool call identifier", async () => {
    await using tmp = await tmpdir()
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_tool" })
        yield* service.complete({ ...context, toolCallId: "call_123" }, "tool.completed", { summary: { name: "read" } })
        yield* service.flush(context.sessionId)
      }),
    )
    const file = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10), "ses_tool.jsonl")
    expect(JSON.parse(await fs.readFile(file, "utf8"))).toMatchObject({ toolCallId: "call_123" })
  })

  test("explicit cleanup applies retention even when capture is disabled", async () => {
    await using tmp = await tmpdir()
    const old = path.join(tmp.path, "log", "diagnostics", "2020-01-01")
    await fs.mkdir(old, { recursive: true })
    await fs.writeFile(path.join(old, "ses_old.jsonl"), "{}\n")
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.cleanup()
      }),
    )
    await expect(fs.stat(path.join(old, "ses_old.jsonl"))).rejects.toThrow()
  })

  test("recovers sequence after reopening and repairs an incomplete tail", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "log", "diagnostics")
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(root, date, "ses_restart.jsonl")

    const write = (event: string) =>
      run(
        tmp.path,
        Effect.gen(function* () {
          const service = yield* DiagnosticTrace.Service
          yield* service.configure({ ...service.config(), enabled: true })
          const context = service.startTask({ sessionId: "ses_restart" })
          yield* service.complete(context, event, { summary: {} })
          yield* service.flush(context.sessionId)
        }),
      )

    await write("first")
    await fs.appendFile(file, '{"incomplete":')
    await write("second")
    const rows = (await fs.readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows.map((row) => row.seq)).toEqual([0, 1])
    expect(rows.map((row) => row.event)).toEqual(["first", "second"])
  })

  test("expands the recovery window to read a complete oversized final record", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "log", "diagnostics")
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(root, date, "ses_large_tail.jsonl")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, JSON.stringify({ seq: 41, payload: "x".repeat(100_000) }) + "\n")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_large_tail" })
        yield* service.complete(context, "after-large-record", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
    )

    const rows = (await fs.readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows.map((row) => row.seq)).toEqual([41, 42])
  })

  test("recovers the sequence from the highest numeric volume after reopening", async () => {
    await using tmp = await tmpdir()
    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(tmp.path, "log", "diagnostics", date)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, "ses_volume.jsonl"), '{"seq":0}\n')
    await fs.writeFile(path.join(directory, "ses_volume.2.jsonl"), '{"seq":2}\n')
    await fs.writeFile(path.join(directory, "ses_volume.10.jsonl"), '{"seq":10}\n')

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_volume" })
        yield* service.complete(context, "reopened", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
    )

    const rows = (await fs.readFile(path.join(directory, "ses_volume.10.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows.map((row) => row.seq)).toEqual([10, 11])
  })

  test("preserves a malformed complete tail and continues in a new volume", async () => {
    await using tmp = await tmpdir()
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(tmp.path, "log", "diagnostics", date, "ses_corrupt.jsonl")
    await fs.mkdir(path.dirname(file), { recursive: true })
    await fs.writeFile(file, '{"seq":4}\n{not-json}\n')

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_corrupt" })
        yield* service.complete(context, "must-not-append", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
    )

    expect(await fs.readFile(file, "utf8")).toBe('{"seq":4}\n{not-json}\n')
    const next = await fs.readFile(file.replace(".jsonl", ".1.jsonl"), "utf8")
    expect(JSON.parse(next)).toMatchObject({ seq: 5, event: "must-not-append" })
  })

  test("isolates filesystem failures from emit and terminal operations", async () => {
    await using tmp = await tmpdir()
    await fs.writeFile(path.join(tmp.path, "log"), "not-a-directory")

    await expect(
      run(
        tmp.path,
        Effect.gen(function* () {
          const service = yield* DiagnosticTrace.Service
          yield* service.configure({ ...service.config(), enabled: true })
          const context = service.startTask({ sessionId: "ses_unwritable" })
          yield* service.emit(context, "task.started", { summary: {} })
          yield* service.complete(context, "task.completed", { summary: {} })
          yield* service.flush(context.sessionId)
        }),
      ),
    ).resolves.toBeUndefined()
  })

  test("invalid Unicode in a session ID cannot fail the business effect", async () => {
    await using tmp = await tmpdir()
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_\ud800" })
        yield* service.emit(context, "task.started", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
    )
  })

  test("evaluates raw payloads once only when enabled by the configuration snapshot", async () => {
    await using tmp = await tmpdir()
    let rawCalls = 0

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, rawPayloads: true })
        const context = service.startTask({ sessionId: "ses_raw" })
        yield* service.complete(context, "llm.request.completed", {
          summary: { requestBytes: 18 },
          raw: async () => {
            rawCalls++
            return { body: "private" }
          },
        })
        yield* service.flush(context.sessionId)
      }),
    )

    expect(rawCalls).toBe(1)
    const date = new Date().toISOString().slice(0, 10)
    const rows = (await fs.readFile(path.join(tmp.path, "log", "diagnostics", date, "ses_raw.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows[0].payload).toEqual({ summary: { requestBytes: 18 }, raw: { body: "private" } })
  })

  test("flush waits for an admitted raw supplier but emit does not", async () => {
    await using tmp = await tmpdir()
    let release: (value: unknown) => void = () => {}
    const raw = new Promise<unknown>((resolve) => {
      release = resolve
    })
    const emitted = await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, rawPayloads: true, streaming: true })
        const context = service.startTask({ sessionId: "ses_deferred" })
        yield* service.emit(context, "llm.request.started", { summary: {}, raw: () => raw })
        return { flush: () => Effect.runPromise(service.flush(context.sessionId)) }
      }),
    )
    let finished = false
    const flushing = emitted.flush().then(() => {
      finished = true
    })
    await Bun.sleep(10)
    expect(finished).toBe(false)
    release({ body: "done" })
    await flushing
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(tmp.path, "log", "diagnostics", date, "ses_deferred.jsonl")
    expect(JSON.parse(await fs.readFile(file, "utf8")).payload.raw).toEqual({ body: "done" })
  })

  test("a rejected raw supplier does not fail flush or the business effect", async () => {
    await using tmp = await tmpdir()
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, rawPayloads: true })
        const context = service.startTask({ sessionId: "ses_rejected" })
        yield* service.emit(context, "llm.request.started", {
          summary: {},
          raw: async () => {
            throw new Error("raw failed")
          },
        })
        yield* service.flush(context.sessionId)
        yield* service.emit(context, "llm.request.completed", { summary: { ok: true } })
        yield* service.flush(context.sessionId)
      }),
    )
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(tmp.path, "log", "diagnostics", date, "ses_rejected.jsonl")
    expect(JSON.parse(await fs.readFile(file, "utf8")).event).toBe("llm.request.completed")
  })

  test("disable stops new admission without dropping an accepted event", async () => {
    await using tmp = await tmpdir()
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_toggle" })
        yield* service.emit(context, "accepted", { summary: {} })
        yield* service.configure({ ...service.config(), enabled: false })
        yield* service.emit(context, "rejected", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
    )
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(tmp.path, "log", "diagnostics", date, "ses_toggle.jsonl")
    expect(
      (await fs.readFile(file, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).event),
    ).toEqual(["accepted"])
  })

  test("phase summaries remain enabled without streaming and yield capacity to terminal events", async () => {
    await using tmp = await tmpdir()
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, streaming: false })
        const context = service.startTask({ sessionId: "ses_phase_priority" })
        yield* service.emit(context, "processing.phase.started", { summary: { phase: "context-assembly" } })
        yield* service.complete(context, "task.completed", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
    )
    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(tmp.path, "log", "diagnostics", date, "ses_phase_priority.jsonl")
    const events = (await fs.readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line).event)
    expect(events).toEqual(["processing.phase.started", "task.completed"])

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, streaming: false })
        const context = service.startTask({ sessionId: "ses_phase_pressure" })
        yield* service.emit(context, "processing.phase.started", { summary: { phase: "context-assembly" } })
        yield* service.complete(context, "task.completed", { summary: {} })
        yield* service.flush(context.sessionId)
      }),
      DiagnosticTrace.testingNode({ lowCapacity: 0, highCapacity: 1 }),
    )
    const pressure = path.join(tmp.path, "log", "diagnostics", date, "ses_phase_pressure.jsonl")
    expect(
      (await fs.readFile(pressure, "utf8"))
        .trim()
        .split("\n")
        .map((line) => JSON.parse(line).event),
    ).toEqual(["task.completed"])
  })

  test("drops low-priority details under pressure but admits terminal events", async () => {
    await using tmp = await tmpdir()
    const node = DiagnosticTrace.testingNode({ lowCapacity: 1, highCapacity: 1 })
    let release: (value: unknown) => void = () => {}
    let rejectedRawCalls = 0
    const raw = new Promise<unknown>((resolve) => {
      release = resolve
    })

    const pending = await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, rawPayloads: true, streaming: true })
        const context = service.startTask({ sessionId: "ses_pressure" })
        yield* service.emit(context, "llm.stream.chunk", { summary: { index: 1 }, raw: () => raw })
        yield* service.emit(context, "llm.stream.chunk", {
          summary: { index: 2 },
          raw: () => {
            rejectedRawCalls++
            return { chunk: "discarded" }
          },
        })
        yield* service.complete(context, "llm.request.completed", { summary: { ok: true } })
        return service.flush()
      }),
      node,
    )

    release({ chunk: "one" })
    await Effect.runPromise(pending)
    const date = new Date().toISOString().slice(0, 10)
    const root = path.join(tmp.path, "log", "diagnostics", date)
    const rows = (await fs.readFile(path.join(root, "ses_pressure.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    const instance = (await fs.readFile(path.join(root, "instance.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))

    expect(rows.map((row) => row.event)).toEqual(["llm.stream.chunk", "llm.request.completed"])
    expect(instance.some((row) => row.event === "diagnostic.events_dropped")).toBe(true)
    expect(rejectedRawCalls).toBe(0)
  })

  test("aggregates high-priority overload without evaluating a rejected raw supplier", async () => {
    await using tmp = await tmpdir()
    const node = DiagnosticTrace.testingNode({ highCapacity: 1 })
    let release: (value: unknown) => void = () => {}
    const raw = new Promise<unknown>((resolve) => {
      release = resolve
    })
    let rejectedRawCalls = 0
    const pending = await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, rawPayloads: true })
        const context = service.startTask({ sessionId: "ses_high_pressure" })
        yield* service.emit(context, "task.started", { summary: {}, raw: () => raw })
        for (let index = 0; index < 3; index++) {
          yield* service.complete(context, "task.completed", {
            summary: {},
            raw: () => {
              rejectedRawCalls++
              return { index }
            },
          })
        }
        return service.flush()
      }),
      node,
    )
    release({ content: "ready" })
    await Effect.runPromise(pending)
    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(tmp.path, "log", "diagnostics", date)
    const instance = (await fs.readFile(path.join(directory, "instance.jsonl"), "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rejectedRawCalls).toBe(0)
    expect(instance.at(-1).payload.counts).toEqual({ "task.completed": 3 })
  })

  test("serializes shared references without labeling them circular", async () => {
    await using tmp = await tmpdir()
    const shared = { count: 1 }
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_shared" })
        yield* service.complete(context, "task.completed", { summary: { first: shared, second: shared } })
        yield* service.flush(context.sessionId)
      }),
    )
    const date = new Date().toISOString().slice(0, 10)
    const line = await fs.readFile(path.join(tmp.path, "log", "diagnostics", date, "ses_shared.jsonl"), "utf8")
    expect(JSON.parse(line).payload.summary).toEqual({ first: { count: 1 }, second: { count: 1 } })
  })

  test("marks only recursive edges as circular", async () => {
    await using tmp = await tmpdir()
    const cyclic: { self?: unknown } = {}
    cyclic.self = cyclic
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_circular" })
        yield* service.complete(context, "task.completed", { summary: cyclic })
        yield* service.flush(context.sessionId)
      }),
    )
    const date = new Date().toISOString().slice(0, 10)
    const line = await fs.readFile(path.join(tmp.path, "log", "diagnostics", date, "ses_circular.jsonl"), "utf8")
    expect(JSON.parse(line).payload.summary).toEqual({ self: { type: "circular" } })
  })

  test("rotates streams before the configured byte threshold and uses numeric volumes", async () => {
    await using tmp = await tmpdir()
    const node = DiagnosticTrace.testingNode({ rotationBytes: 1 })
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_rotate" })
        for (let index = 0; index < 12; index++) {
          yield* service.complete(context, `event-${index}`, { summary: {} })
        }
        yield* service.flush(context.sessionId)
      }),
      node,
    )

    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(tmp.path, "log", "diagnostics", date)
    const files = (await fs.readdir(directory)).filter((name) => name.startsWith("ses_rotate"))
    expect(files.sort((a, b) => volume(a) - volume(b))).toHaveLength(12)
    const rows = await Promise.all(
      files.map(async (file) => JSON.parse(await fs.readFile(path.join(directory, file), "utf8"))),
    )
    expect(rows.sort((a, b) => a.seq - b.seq).map((row) => row.event)).toEqual(
      Array.from({ length: 12 }, (_, index) => `event-${index}`),
    )
  })

  test("cleanup removes expired date directories", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "log", "diagnostics")
    const oldDirectory = path.join(root, "2020-01-01")
    await fs.mkdir(oldDirectory, { recursive: true })
    await fs.writeFile(path.join(oldDirectory, "instance.jsonl"), "old\n")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        yield* service.cleanup()
      }),
    )

    await expect(fs.stat(oldDirectory)).rejects.toThrow()
  })

  test("enabled diagnostics clean expired files periodically and stop when disabled", async () => {
    await using tmp = await tmpdir()
    const oldDirectory = path.join(tmp.path, "log", "diagnostics", "2020-01-01")
    await fs.mkdir(oldDirectory, { recursive: true })
    const oldFile = path.join(oldDirectory, "ses_retention.jsonl")
    await fs.writeFile(oldFile, "old\n")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        yield* Effect.promise(async () => {
          for (let attempt = 0; attempt < 100 && (await fs.stat(oldFile).catch(() => undefined)); attempt++) {
            await Bun.sleep(10)
          }
        })
        expect(yield* Effect.promise(() => fs.stat(oldFile).catch(() => undefined))).toBeUndefined()

        yield* Effect.promise(async () => {
          await fs.mkdir(oldDirectory, { recursive: true })
          await fs.writeFile(oldFile, "again\n")
        })
        yield* Effect.promise(async () => {
          for (let attempt = 0; attempt < 100 && (await fs.stat(oldFile).catch(() => undefined)); attempt++) {
            await Bun.sleep(10)
          }
        })
        expect(yield* Effect.promise(() => fs.stat(oldFile).catch(() => undefined))).toBeUndefined()

        yield* service.configure({ ...service.config(), enabled: false })
        yield* service.cleanup()
        yield* Effect.promise(async () => {
          await fs.mkdir(oldDirectory, { recursive: true })
          await fs.writeFile(oldFile, "preserved\n")
        })
        yield* Effect.promise(() => Bun.sleep(100))
        expect(yield* Effect.promise(() => fs.readFile(oldFile, "utf8"))).toBe("preserved\n")
      }),
      DiagnosticTrace.testingNode({ cleanupIntervalMs: 25 }),
    )
  })

  test("periodic cleanup enforces the size limit without deleting the active volume", async () => {
    await using tmp = await tmpdir()
    const directory = path.join(tmp.path, "log", "diagnostics", new Date().toISOString().slice(0, 10))
    const closed = path.join(directory, "ses_periodic.jsonl")
    const active = path.join(directory, "ses_periodic.1.jsonl")
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(active, "active\n")

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, maxTotalBytes: 1 })
        yield* service.cleanup()
        yield* Effect.promise(() => fs.writeFile(closed, "closed\n"))
        yield* Effect.promise(async () => {
          for (let attempt = 0; attempt < 100 && (await fs.stat(closed).catch(() => undefined)); attempt++) {
            await Bun.sleep(10)
          }
        })
        expect(yield* Effect.promise(() => fs.stat(closed).catch(() => undefined))).toBeUndefined()
        expect(yield* Effect.promise(() => fs.readFile(active, "utf8"))).toBe("active\n")
      }),
      DiagnosticTrace.testingNode({ cleanupIntervalMs: 100 }),
    )
  })

  test("manual clear removes today's active diagnostic files and accepts new writes", async () => {
    await using tmp = await tmpdir()
    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(tmp.path, "log", "diagnostics", date)
    const result = await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_manual" })
        yield* service.complete(context, "task.completed", { summary: {} })
        yield* service.complete(undefined, "plugin.loaded", { summary: {} })
        yield* service.flush()
        const cleared = yield* service.clear()
        yield* service.complete(context, "task.completed", { summary: {} })
        yield* service.flush()
        return cleared
      }),
    )
    expect(result).toEqual({ deleted: 2, skipped: 0 })
    await expect(fs.stat(path.join(directory, "instance.jsonl"))).rejects.toThrow()
    const rows = (await fs.readFile(path.join(directory, "ses_manual.jsonl"), "utf8")).trim().split("\n")
    expect(rows).toHaveLength(1)
    expect(JSON.parse(rows[0]).seq).toBe(0)
  })

  test("manual clear reports files skipped under another writer's lock", async () => {
    await using tmp = await tmpdir()
    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(tmp.path, "log", "diagnostics", date)
    const stream = path.join(directory, "ses_locked.jsonl")
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(stream, "locked\n")
    await fs.writeFile(path.join(directory, "instance.jsonl"), "free\n")
    const lease = await Flock.acquire(stream, {
      dir: path.join(tmp.path, "state", "locks"),
      staleMs: 5_000,
      timeoutMs: 5_000,
    })
    try {
      const result = await run(
        tmp.path,
        Effect.gen(function* () {
          const service = yield* DiagnosticTrace.Service
          return yield* service.clear()
        }),
        DiagnosticTrace.testingNode({ cleanupLockTimeoutMs: 0 }),
      )
      expect(result).toEqual({ deleted: 1, skipped: 1 })
      expect(await fs.readFile(stream, "utf8")).toBe("locked\n")
      await expect(fs.stat(path.join(directory, "instance.jsonl"))).rejects.toThrow()
    } finally {
      await lease.release()
    }
  })

  test("explicit cleanup processes more than one thousand expired volumes", async () => {
    await using tmp = await tmpdir()
    const oldDirectory = path.join(tmp.path, "log", "diagnostics", "2020-01-01")
    await fs.mkdir(oldDirectory, { recursive: true })
    await Promise.all(
      Array.from({ length: 1002 }, (_, index) =>
        fs.writeFile(path.join(oldDirectory, `ses_cleanup.${index + 1}.jsonl`), "old\n"),
      ),
    )
    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.cleanup()
      }),
    )
    await expect(fs.stat(oldDirectory)).rejects.toThrow()
  }, 30_000)

  test("zero retention days still enforces total bytes without deleting the active volume", async () => {
    await using tmp = await tmpdir()
    const root = path.join(tmp.path, "log", "diagnostics")
    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(root, date)
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(path.join(directory, "ses_cleanup.jsonl"), "closed-volume\n")
    await fs.writeFile(path.join(directory, "ses_cleanup.1.jsonl"), "active-volume\n")
    const old = new Date(Date.now() - 60_000)
    await fs.utimes(path.join(directory, "ses_cleanup.jsonl"), old, old)

    await run(
      tmp.path,
      Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true, retentionDays: 0, maxTotalBytes: 1 })
        yield* service.cleanup()
      }),
    )

    await expect(fs.stat(path.join(directory, "ses_cleanup.jsonl"))).rejects.toThrow()
    expect(await fs.readFile(path.join(directory, "ses_cleanup.1.jsonl"), "utf8")).toBe("active-volume\n")
  })

  test("cleanup skips a stream while its lock is held", async () => {
    await using tmp = await tmpdir()
    const date = new Date().toISOString().slice(0, 10)
    const directory = path.join(tmp.path, "log", "diagnostics", date)
    const stream = path.join(directory, "ses_locked.jsonl")
    await fs.mkdir(directory, { recursive: true })
    await fs.writeFile(stream, "closed-volume\n")
    await fs.writeFile(path.join(directory, "ses_locked.1.jsonl"), "active-volume\n")
    const lease = await Flock.acquire(stream, {
      dir: path.join(tmp.path, "state", "locks"),
      staleMs: 5_000,
      timeoutMs: 5_000,
    })
    try {
      await run(
        tmp.path,
        Effect.gen(function* () {
          const service = yield* DiagnosticTrace.Service
          yield* service.configure({ ...service.config(), enabled: true, retentionDays: 0, maxTotalBytes: 1 })
          yield* service.cleanup()
        }),
        DiagnosticTrace.testingNode({ cleanupLockTimeoutMs: 0 }),
      )
    } finally {
      await lease.release()
    }
    expect(await fs.readFile(stream, "utf8")).toBe("closed-volume\n")
  })

  test("serializes concurrent appends from independent processes", async () => {
    await using tmp = await tmpdir()
    const script = `
      import path from "node:path"
      import { Effect } from "effect"
      import { AppNodeBuilder } from "@opencode-ai/core/effect/app-node-builder"
      import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
      import { Global } from "@opencode-ai/core/global"
      const base = process.env.DIAGNOSTIC_TEST_ROOT
      const layer = AppNodeBuilder.build(DiagnosticTrace.testingNode({ lockTimeoutMs: 5000, lockStaleMs: 5000 }), [
        [Global.node, Global.layerWith({ log: path.join(base, "log"), state: path.join(base, "state") })],
      ])
      await Effect.runPromise(Effect.gen(function* () {
        const service = yield* DiagnosticTrace.Service
        yield* service.configure({ ...service.config(), enabled: true })
        const context = service.startTask({ sessionId: "ses_processes" })
        for (let index = 0; index < 12; index++) {
          yield* service.complete(context, "process-" + process.env.WORKER + "-" + index, { summary: {} })
        }
        yield* service.flush(context.sessionId)
      }).pipe(Effect.provide(layer)))
    `
    const children = [0, 1].map((worker) =>
      Bun.spawn(["bun", "-e", script], {
        cwd: process.cwd(),
        env: { ...process.env, DIAGNOSTIC_TEST_ROOT: tmp.path, WORKER: String(worker) },
        stdout: "pipe",
        stderr: "pipe",
        signal: AbortSignal.timeout(30_000),
      }),
    )
    const results = await Promise.all(
      children.map(async (child) => ({
        code: await child.exited,
        stderr: await new Response(child.stderr).text(),
      })),
    )
    expect(results).toEqual([
      { code: 0, stderr: "" },
      { code: 0, stderr: "" },
    ])

    const date = new Date().toISOString().slice(0, 10)
    const file = path.join(tmp.path, "log", "diagnostics", date, "ses_processes.jsonl")
    const rows = (await fs.readFile(file, "utf8"))
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line))
    expect(rows).toHaveLength(24)
    expect(rows.map((row) => row.seq)).toEqual(Array.from({ length: 24 }, (_, index) => index))
  })
})

function volume(file: string) {
  return Number(file.match(/\.(\d+)\.jsonl$/)?.[1] ?? 0)
}
