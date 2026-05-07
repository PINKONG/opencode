import { randomBytes } from "crypto"

const PREFIX = "es_"

const sessions = new Map<string, string>()

export function issueEmbedSession(token: string) {
  const key = PREFIX + randomBytes(24).toString("base64url")
  sessions.set(key, token)
  return key
}

export function resolveEmbedSession(key: string | undefined) {
  if (!key) return
  return sessions.get(key)
}
