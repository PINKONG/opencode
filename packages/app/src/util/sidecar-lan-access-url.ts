import type { ServerConnection } from "@/context/server"
import { buildServerAccessUrl } from "./server-access-url"

export function buildSidecarLanAccessUrl(server: ServerConnection.HttpBase, url: string) {
  return buildServerAccessUrl({ ...server, displayUrl: url })
}
