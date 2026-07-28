import { describe, expect, test } from "bun:test"
import fs from "node:fs/promises"
import os from "node:os"
import path from "node:path"
import { loadModelsData } from "../../script/models-data"

describe("models.dev build snapshot", () => {
  test("falls back to the checked-in models snapshot when the network refresh fails", async () => {
    const dir = await fs.mkdtemp(path.join(os.tmpdir(), "wiscode-models-data-"))
    await fs.mkdir(path.join(dir, "src/provider"), { recursive: true })
    await Bun.write(
      path.join(dir, "src/provider/models-snapshot.js"),
      `// @ts-nocheck\nexport const snapshot = {"provider":{"id":"provider"}}\n`,
    )

    const data = await loadModelsData({
      dir,
      env: {},
      fetcher: () => Promise.reject(new Error("certificate failed")),
    })

    expect(JSON.parse(data)).toEqual({ provider: { id: "provider" } })
  })
})
