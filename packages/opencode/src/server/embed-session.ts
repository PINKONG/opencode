import { randomBytes } from "crypto"

const PREFIX = "es_"
const TTL_MS = 15 * 60 * 1000

const sessions = new Map<string, { token: string; exp: number }>()

function now() {
  return Date.now()
}

function prune(timestamp = now()) {
  for (const [key, value] of sessions) {
    if (value.exp <= timestamp) sessions.delete(key)
  }
}

export function issueEmbedSession(token: string) {
  prune()
  const key = PREFIX + randomBytes(24).toString("base64url")
  sessions.set(key, { token, exp: now() + TTL_MS })
  return key
}

export function resolveEmbedSession(key: string | undefined) {
  if (!key) return
  const current = sessions.get(key)
  if (!current) return
  if (current.exp <= now()) {
    sessions.delete(key)
    return
  }
  return current.token
}

