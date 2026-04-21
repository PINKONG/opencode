import { findMaxkbClients } from "@/data/maxkb"

type Sdk = {
  experimental: {
    resource: {
      list: (input?: { directory?: string; workspace?: string }) => Promise<{
        data?: Record<string, { client: string; uri: string; name: string }>
      }>
    }
  }
}

export function knowledgeAvailabilityKey(dir: string) {
  return ["maxkb-availability", dir] as const
}

export async function loadKnowledgeAvailability(dir: string, sdk: Sdk) {
  const out = await sdk.experimental.resource.list({ directory: dir })
  return {
    directory: dir,
    clients: findMaxkbClients(out.data ?? {}),
  }
}
