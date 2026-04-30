const KEY = "embed_session"
const META = "oc-embed-session"

export function readEmbedSessionFromQuery(search: string) {
  const value = new URLSearchParams(search).get(KEY)?.trim()
  return value || undefined
}

export function readEmbedSessionFromMeta() {
  if (typeof document === "undefined") return
  const value = document.querySelector(`meta[name="${META}"]`)?.getAttribute("content")?.trim()
  return value || undefined
}

export function readEmbedSessionBootstrap(search: string) {
  return readEmbedSessionFromQuery(search) ?? readEmbedSessionFromMeta()
}
