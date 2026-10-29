import { uuid } from "@/utils/uuid"

type Write = (input: { sessionID: string; directory: string; data: Record<string, unknown>; requestId: string; state: { revision?: number; version?: number } }) => Promise<void>

export function createExternalContextSync(write: Write, wait?: () => Promise<void>) {
  let tail = Promise.resolve()
  const bindings = new Map<string, { data: Record<string, unknown>; task: Promise<void> }>()

  const bind = (sessionID: string, directory: string, data: Record<string, unknown>) => {
    const key = JSON.stringify([directory, sessionID])
    const previous = bindings.get(key)
    if (previous?.data === data) return previous.task
    const requestId = uuid()
    const state: { revision?: number; version?: number } = {}
    const task = tail.then(async () => {
      await wait?.()
      for (let attempt = 0; attempt < 3; attempt += 1) {
        try {
          await write({ sessionID, directory, data, requestId, state })
          return
        } catch (error) {
          if (attempt === 2 || !isTransient(error)) throw error
          await new Promise((resolve) => setTimeout(resolve, 100 * 2 ** attempt))
        }
      }
    })
    tail = task.catch(() => {})
    bindings.set(key, { data, task })
    return task
  }

  return {
    bind,
    wait: () => tail,
  }
}

function isTransient(error: unknown) {
  if (error instanceof TypeError) return true
  if (!error || typeof error !== "object" || !("status" in error)) return false
  const status = error.status
  return typeof status === "number" && (status === 408 || status === 429 || status >= 500)
}
