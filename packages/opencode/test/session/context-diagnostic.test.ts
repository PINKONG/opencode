import { expect, test } from "bun:test"
import { Effect } from "effect"
import { recordContextSources } from "@/session/context-diagnostic"

test("context source records metadata without leaking content by default", async () => {
  const emitted: Array<{ event: string; summary: unknown; raw?: () => unknown }> = []
  const diagnostics = {
    emit: (_context: unknown, event: string, input: { summary: unknown; raw?: () => unknown }) => Effect.sync(() => {
      emitted.push({ event, ...input })
    }),
  }
  await Effect.runPromise(recordContextSources(diagnostics, { sessionId: "ses_1" }, [
    { kind: "system", id: "environment", content: "secret-system" },
    { kind: "reference", id: "/repo/AGENTS.md", content: "secret-reference" },
  ]))
  expect(emitted.map((item) => item.event)).toEqual(["context.source.loaded", "context.source.loaded"])
  expect(JSON.stringify(emitted.map((item) => item.summary))).not.toContain("secret")
  expect(emitted[0]?.raw?.()).toMatchObject({ content: "secret-system" })
})
