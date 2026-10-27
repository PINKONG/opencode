import { SessionExternalContext } from "@opencode-ai/core/session/external-context"

type Listener = (data: Record<string, unknown>) => void

let latest: Record<string, unknown> | undefined
let origin: string | undefined
const listeners = new Set<Listener>()
let waiter = (_sessionID: string, _directory: string) => Promise.resolve()

export function installExternalContextBridge(enabled = true) {
  if (!enabled || typeof window === "undefined" || window.parent === window) return () => {}
  const onMessage = (event: MessageEvent) => {
    if (event.source !== window.parent || event.origin === "null") return
    if (origin !== undefined && event.origin !== origin) return
    if (!event.data || typeof event.data !== "object" || event.data.type !== "wiscode.context.update") return
    try {
      const data = SessionExternalContext.validateData(event.data.data)
      origin ??= event.origin
      latest = data
      listeners.forEach((listener) => listener(data))
    } catch (error) {
      console.warn("WisCode external context message rejected", error instanceof Error ? error.message : "invalid data")
      return
    }
  }
  window.addEventListener("message", onMessage)
  return () => window.removeEventListener("message", onMessage)
}

export function subscribeExternalContext(listener: Listener) {
  listeners.add(listener)
  if (latest !== undefined) listener(latest)
  return () => listeners.delete(listener)
}

export function currentExternalContext() {
  return latest
}

export function setExternalContextWaiter(next: (sessionID: string, directory: string) => Promise<void>) {
  waiter = next
  return () => {
    if (waiter === next) waiter = () => Promise.resolve()
  }
}

export function waitForExternalContext(sessionID: string, directory: string) {
  return waiter(sessionID, directory)
}
