import path from "path"
import { fileURLToPath } from "url"
import { loadModelsData } from "./models-data"

const __filename = fileURLToPath(import.meta.url)
const __dirname = path.dirname(__filename)
const dir = path.resolve(__dirname, "..")

process.chdir(dir)

export const modelsData = await loadModelsData({ dir })
console.log("Loaded models.dev snapshot")
