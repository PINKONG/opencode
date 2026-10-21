import { expect, test } from "bun:test"
import { Effect } from "effect"
import { observeTool } from "@/session/tool-diagnostic"
import { Diagnostic } from "@opencode-ai/schema"

test("tool observation records the same call ID around successful execution", async () => {
  const events: { event: string; callID?: string; payload: unknown }[] = []
  const diagnostics = {
    emit: (context: { toolCallId?: string } | undefined, event: string, input: { summary: unknown }) =>
      Effect.sync(() => {
        events.push({ event, callID: context?.toolCallId, payload: input.summary })
      }),
    complete: (context: { toolCallId?: string } | undefined, event: string, input: { summary: unknown }) =>
      Effect.sync(() => {
        events.push({ event, callID: context?.toolCallId, payload: input.summary })
      }),
  }
  const result = await observeTool({
    diagnostics,
    context: { sessionId: "ses_test" },
    name: "read",
    kind: "builtin",
    callID: "call_1",
    args: { path: "a" },
    execute: async () => ({ output: "ok" }),
  })
  expect(result).toEqual({ output: "ok" })
  expect(events.map((item) => item.event)).toEqual(["tool.started", "tool.completed"])
  expect(events.map((item) => item.callID)).toEqual(["call_1", "call_1"])
})

test("tool completion includes the permission decision made during execution", async () => {
  const summaries: unknown[] = []
  const diagnostics = {
    emit: () => Effect.void,
    complete: (_context: unknown, _event: string, input: { summary: unknown }) =>
      Effect.sync(() => {
        summaries.push(input.summary)
      }),
  }
  let decision = { requested: false, decision: "not-requested" }
  await observeTool({
    diagnostics,
    context: {},
    name: "read",
    kind: "builtin",
    callID: "call_4",
    args: {},
    permission: () => decision,
    execute: async () => {
      decision = { requested: true, decision: "allowed" }
      return "ok"
    },
  })
  expect(summaries[0]).toMatchObject({ permission: { requested: true, decision: "allowed" } })
})

test("task tool completion links parent and child traces", async () => {
  const summaries: unknown[] = []
  await observeTool({
    diagnostics: {
      emit: () => Effect.void,
      complete: (_ctx: unknown, _event: string, input: { summary: unknown }) =>
        Effect.sync(() => {
          summaries.push(input.summary)
        }),
    },
    context: { sessionId: "ses_parent", traceId: Diagnostic.TraceID.make("trace_parent") },
    name: "task",
    kind: "builtin",
    callID: "call_child",
    args: {},
    execute: async () => ({ metadata: { sessionId: "ses_child", childTraceId: "trace_child" } }),
  })
  expect(summaries[0]).toMatchObject({
    parentSessionId: "ses_parent",
    parentTraceId: "trace_parent",
    childSessionId: "ses_child",
    childTraceId: "trace_child",
  })
})

test("tool observation preserves failures and records failed outcome", async () => {
  const events: string[] = []
  const diagnostics = {
    emit: (_context: unknown, event: string) =>
      Effect.sync(() => {
        events.push(event)
      }),
    complete: (_context: unknown, event: string) =>
      Effect.sync(() => {
        events.push(event)
      }),
  }
  await expect(
    observeTool({
      diagnostics,
      context: {},
      name: "read",
      kind: "builtin",
      callID: "call_2",
      args: {},
      execute: async () => {
        throw new Error("denied")
      },
    }),
  ).rejects.toThrow("denied")
  expect(events).toEqual(["tool.started", "tool.failed"])
})

test("tool observation uses the active provider turn at execution time", async () => {
  const turns: string[] = []
  const diagnostics = {
    emit: (context: { turnId?: string } | undefined) =>
      Effect.sync(() => {
        turns.push(context?.turnId ?? "missing")
      }),
    complete: (context: { turnId?: string } | undefined) =>
      Effect.sync(() => {
        turns.push(context?.turnId ?? "missing")
      }),
  }
  let turnId = Diagnostic.TurnID.make("turn_first")
  const input = {
    diagnostics,
    context: { sessionId: "ses_test" },
    activeTurn: () => ({ turnId }),
    name: "read",
    kind: "builtin" as const,
    callID: "call_3",
    args: {},
    execute: async () => "ok",
  }
  turnId = Diagnostic.TurnID.make("turn_retry")
  await observeTool(input)
  expect(turns).toEqual(["turn_retry", "turn_retry"])
})

test("MaxKB MCP searches emit linked knowledge events without a second execution", async () => {
  const events: Array<{ event: string; callID?: string }> = []
  const diagnostics = {
    emit: (context: { toolCallId?: string } | undefined, event: string) =>
      Effect.sync(() => {
        events.push({ event, callID: context?.toolCallId })
      }),
    complete: (context: { toolCallId?: string } | undefined, event: string) =>
      Effect.sync(() => {
        events.push({ event, callID: context?.toolCallId })
      }),
  }
  let calls = 0
  await observeTool({
    diagnostics,
    context: { sessionId: "ses_test" },
    name: "maxkb_prod_search_knowledge",
    kind: "mcp",
    callID: "call_knowledge",
    args: { query: "question" },
    execute: async () => {
      calls++
      return "answer"
    },
  })
  expect(calls).toBe(1)
  expect(events).toEqual([
    { event: "tool.started", callID: "call_knowledge" },
    { event: "knowledge.query.started", callID: "call_knowledge" },
    { event: "tool.completed", callID: "call_knowledge" },
    { event: "knowledge.query.completed", callID: "call_knowledge" },
  ])
})
