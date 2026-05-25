import { createMemo } from "solid-js"
import { useGlobalSync } from "@/context/global-sync"
import { useModels } from "@/context/models"
import { useProviders } from "@/hooks/use-providers"

type ModelKey = { providerID: string; modelID: string }

export function useGlobalModelSelection() {
  const globalSync = useGlobalSync()
  const providers = useProviders()
  const models = useModels()

  const validModel = (model: ModelKey) => {
    const provider = providers.all().get(model.providerID)
    return !!provider?.models[model.modelID] && providers.connected().some((item) => item.id === model.providerID)
  }

  const configuredModel = () => {
    if (!globalSync.data.config.model) return
    const [providerID, modelID] = globalSync.data.config.model.split("/")
    const model = { providerID, modelID }
    if (validModel(model)) return model
  }

  const recentModel = () => {
    for (const item of models.recent.list()) {
      if (validModel(item)) return item
    }
  }

  const defaultModel = () => {
    const defaults = providers.default()
    for (const provider of providers.connected()) {
      const configured = defaults[provider.id]
      if (configured) {
        const model = { providerID: provider.id, modelID: configured }
        if (validModel(model)) return model
      }

      const first = Object.values(provider.models)[0]
      if (!first) continue
      const model = { providerID: provider.id, modelID: first.id }
      if (validModel(model)) return model
    }
  }

  const currentKey = createMemo(() => configuredModel() ?? recentModel() ?? defaultModel())

  return {
    ready: models.ready,
    current: () => {
      const item = currentKey()
      if (!item) return
      return models.find(item)
    },
    recent: createMemo(() => models.recent.list().map(models.find).filter(Boolean)),
    list: models.list,
    set(item: ModelKey | undefined, options?: { recent?: boolean }) {
      void globalSync.updateConfig({
        model: item ? `${item.providerID}/${item.modelID}` : undefined,
      })
      if (!item) return
      models.setVisibility(item, true)
      if (!options?.recent) return
      models.recent.push(item)
    },
    visible(item: ModelKey) {
      return models.visible(item)
    },
    setVisibility(item: ModelKey, visible: boolean) {
      models.setVisibility(item, visible)
    },
  }
}
