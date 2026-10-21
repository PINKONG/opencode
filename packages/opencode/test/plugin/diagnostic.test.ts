import { expect, test } from "bun:test"
import { Effect } from "effect"
import { observePluginHook } from "@/plugin/diagnostic"

test("plugin hook observation records lifecycle and preserves output", async () => {
  const events: string[] = []
  const diagnostics = {
    emit: (_context: unknown, event: string) => Effect.sync(() => { events.push(event) }),
    complete: (_context: unknown, event: string) => Effect.sync(() => { events.push(event) }),
  }
  const output = { value: "before" }
  await observePluginHook({ diagnostics, context: { sessionId: "ses_1" }, pluginId: "plugin-a", hook: "test", input: { id: 1 }, output, execute: async () => { output.value = "after" } })
  expect(events).toEqual(["plugin.hook.started", "plugin.hook.completed"])
  expect(output.value).toBe("after")
})

test("plugin hook observation records failure without hiding the original error", async () => {
  const events: string[] = []
  const diagnostics = {
    emit: (_context: unknown, event: string) => Effect.sync(() => { events.push(event) }),
    complete: (_context: unknown, event: string) => Effect.sync(() => { events.push(event) }),
  }
  await expect(observePluginHook({ diagnostics, pluginId: "plugin-a", hook: "test", input: {}, output: {}, execute: async () => { throw new Error("hook failed") } })).rejects.toThrow("hook failed")
  expect(events).toEqual(["plugin.hook.started", "plugin.hook.failed"])
})
