export function refreshCommandsOnIdle(
  event: { type: string; properties?: unknown; current?: { type: string } },
  refresh: () => Promise<void>,
) {
  if (event.type === "session.idle") return refresh()
  if (
    event.type === "session.status" &&
    typeof event.properties === "object" &&
    event.properties !== null &&
    "status" in event.properties &&
    typeof event.properties.status === "object" &&
    event.properties.status !== null &&
    "type" in event.properties.status &&
    event.properties.status.type === "idle"
  )
    return refresh()
  if (
    event.current?.type === "session.execution.succeeded" ||
    event.current?.type === "session.execution.failed" ||
    event.current?.type === "session.execution.interrupted"
  )
    return refresh()
  return Promise.resolve()
}
