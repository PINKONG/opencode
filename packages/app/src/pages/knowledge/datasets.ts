type Api = {
  datasets: () => Promise<{
    datasets: Array<{
      id: string
      name: string
      desc?: string
      document_count?: number
      char_length?: number
    }>
    truncated: boolean
  }>
}

export function selectKnowledgeClient(clients: string[], selected?: string) {
  if (selected && clients.includes(selected)) return selected
  if (clients.length !== 1) return
  return clients[0]
}

export async function loadDatasets(api: Api) {
  return api.datasets()
}
