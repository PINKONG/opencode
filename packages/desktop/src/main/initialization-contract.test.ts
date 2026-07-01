import { expect, test } from "bun:test"
import { readFileSync } from "node:fs"
import path from "node:path"

const root = path.resolve(import.meta.dirname, "../..")
const read = (file: string) => readFileSync(path.join(root, file), "utf8")

test("desktop startup uses the single-window initialization contract", () => {
  const main = read("src/main/index.ts")
  const ipc = read("src/main/ipc.ts")
  const preload = read("src/preload/index.ts")
  const preloadTypes = read("src/preload/types.ts")
  const vite = read("electron.vite.config.ts")

  expect(preload).toContain('awaitInitialization: () => ipcRenderer.invoke("await-initialization")')
  expect(preloadTypes).toContain("awaitInitialization: () => Promise<ServerReadyData>")
  expect(vite).toContain('main: "src/renderer/index.html"')

  expect(main).not.toContain("createLoadingWindow")
  expect(main).not.toContain("loadingWindowComplete")
  expect(main).not.toContain("sendSqliteMigrationProgress")
  expect(main).not.toContain("InitStep")
  expect(main).not.toContain("SqliteMigrationProgress")

  expect(ipc).not.toContain("InitStep")
  expect(ipc).not.toContain("SqliteMigrationProgress")
  expect(ipc).not.toContain('event.sender.send("init-step"')
})

test("desktop sidecar LAN status exposes a tokenized access URL", () => {
  const main = read("src/main/index.ts")
  const preloadTypes = read("src/preload/types.ts")

  expect(preloadTypes).toContain("accessUrl: string | null")
  expect(main).toContain('sidecarLanAccessUrl.searchParams.set("auth_token"')
  expect(main).toContain("accessUrl: sidecarLanAccessUrl?.toString() ?? null")
})
