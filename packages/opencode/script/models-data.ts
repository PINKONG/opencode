import path from "node:path"

type Input = {
  dir: string
  env?: Record<string, string | undefined>
  fetcher?: (url: string) => Promise<Response>
}

export async function loadModelsData(input: Input) {
  const env = input.env ?? process.env
  if (env.MODELS_DEV_API_JSON) return Bun.file(env.MODELS_DEV_API_JSON).text()

  const snapshot = await readExistingSnapshot(input.dir)
  if (snapshot && env.OPENCODE_REFRESH_MODELS_DEV !== "1") return snapshot

  const modelsUrl = env.OPENCODE_MODELS_URL || "https://models.dev"
  return (await (input.fetcher ?? fetch)(`${modelsUrl}/api.json`)).text()
}

async function readExistingSnapshot(dir: string) {
  const file = Bun.file(path.join(dir, "src/provider/models-snapshot.js"))
  if (!(await file.exists())) return

  const text = await file.text()
  const match = /export const snapshot = ([\s\S]*)\s*$/.exec(text)
  if (!match) return
  return match[1].trim().replace(/;$/, "")
}
