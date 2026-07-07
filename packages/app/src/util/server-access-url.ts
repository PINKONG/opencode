import type { ServerConnection } from "@/context/server"

export function buildServerAccessUrl(server: ServerConnection.HttpBase) {
  const next = new URL(server.displayUrl ?? server.url)
  if (!server.password) return next.toString()
  const username = server.username ?? "wiscode"
  next.searchParams.set("auth_token", btoa(`${username}:${server.password}`))
  return next.toString()
}
