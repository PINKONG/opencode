import { createQuery } from "@tanstack/solid-query"
import { createMemo } from "solid-js"
import { useServerSDK } from "@/context/server-sdk"
import { knowledgeAvailabilityKey, loadKnowledgeAvailability } from "./helpers"

export function useKnowledgeAvailability(dir: () => string | undefined) {
  const sdk = useServerSDK()
  const path = createMemo(() => dir()?.trim())
  const retry = (count: number) => count < 1

  return createQuery(() => ({
    enabled: !!path(),
    queryKey: knowledgeAvailabilityKey(path() ?? ""),
    queryFn: async () => {
      const value = path()
      if (!value) return { directory: "", clients: [] }
      return loadKnowledgeAvailability(
        value,
        sdk().createClient({
          directory: value,
          throwOnError: true,
        }),
      )
    },
    retry,
  }))
}
