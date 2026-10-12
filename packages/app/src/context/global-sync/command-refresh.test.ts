import { describe, expect, test } from "bun:test"
import { refreshCommandsOnIdle } from "./command-refresh"

describe("command refresh after session idle", () => {
  test("refreshes after V1 idle and V2 completion, but not other events", async () => {
    const calls: string[] = []
    const refresh = async () => {
      calls.push("refresh")
    }

    await refreshCommandsOnIdle({ type: "session.idle" }, refresh)
    await refreshCommandsOnIdle({ type: "session.status", properties: { status: { type: "idle" } } }, refresh)
    await refreshCommandsOnIdle({ type: "event", current: { type: "session.execution.succeeded" } }, refresh)
    await refreshCommandsOnIdle({ type: "event", current: { type: "session.execution.failed" } }, refresh)
    await refreshCommandsOnIdle({ type: "event", current: { type: "session.execution.interrupted" } }, refresh)
    await refreshCommandsOnIdle({ type: "message.updated" }, refresh)
    await refreshCommandsOnIdle({ type: "session.status", properties: { status: { type: "busy" } } }, refresh)
    await refreshCommandsOnIdle({ type: "event", current: { type: "session.execution.started" } }, refresh)

    expect(calls).toEqual(["refresh", "refresh", "refresh", "refresh", "refresh"])
  })
})
