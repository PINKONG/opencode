import { app } from "electron"
import { randomUUID } from "node:crypto"
import { existsSync } from "node:fs"
import { join } from "node:path"
import type { SidecarLanConfig } from "../preload/types"
import {
  DEFAULT_SERVER_URL_KEY,
  SIDECAR_EXPOSE_LAN_KEY,
  SIDECAR_PERSISTENT_PASSWORD_KEY,
  SIDECAR_PORT_KEY,
  WSL_ENABLED_KEY,
} from "./constants"
import { normalizeSidecarLanConfig } from "./sidecar-config"
import { getUserShell, loadShellEnv } from "./shell-env"
import { store } from "./store"

export type WslConfig = { enabled: boolean }
export type HealthCheck = { wait: Promise<void> }

export function getDefaultServerUrl(): string | null {
  const value = store.get(DEFAULT_SERVER_URL_KEY)
  return typeof value === "string" ? value : null
}

export function setDefaultServerUrl(url: string | null) {
  if (url) {
    store.set(DEFAULT_SERVER_URL_KEY, url)
    return
  }

  store.delete(DEFAULT_SERVER_URL_KEY)
}

export function getWslConfig(): WslConfig {
  const value = store.get(WSL_ENABLED_KEY)
  return { enabled: typeof value === "boolean" ? value : false }
}

export function setWslConfig(config: WslConfig) {
  store.set(WSL_ENABLED_KEY, config.enabled)
}

export function getSidecarLanConfig(): SidecarLanConfig {
  const raw = store.get(SIDECAR_EXPOSE_LAN_KEY)
  const fixedPort = store.get(SIDECAR_PORT_KEY)
  return normalizeSidecarLanConfig({
    ...(typeof raw === "object" && raw ? (raw as object) : { enabled: raw === true }),
    fixedPort,
  })
}

export function setSidecarLanConfig(config: SidecarLanConfig) {
  store.set(SIDECAR_EXPOSE_LAN_KEY, {
    enabled: config.enabled,
    addressMode: config.addressMode,
    customAddress: config.customAddress,
    fixedToken: config.fixedToken === true,
  })
  if (typeof config.fixedPort === "number") {
    store.set(SIDECAR_PORT_KEY, config.fixedPort)
    return
  }
  store.delete(SIDECAR_PORT_KEY)
}

export function getOrCreatePersistentPassword() {
  const current = store.get(SIDECAR_PERSISTENT_PASSWORD_KEY)
  if (typeof current === "string" && current.trim()) return current
  const next = randomUUID()
  store.set(SIDECAR_PERSISTENT_PASSWORD_KEY, next)
  return next
}

export async function spawnLocalServer(hostname: string, port: number, password: string, healthHost = hostname) {
  prepareServerEnv(password)
  const { Log, Server } = await import("virtual:opencode-server")
  await Log.init({ level: "WARN" })
  const listener = await Server.listen({
    port,
    hostname,
    username: "opencode",
    password,
  })

  const wait = (async () => {
    const url = `http://${healthHost}:${port}`

    const ready = async () => {
      while (true) {
        await new Promise((resolve) => setTimeout(resolve, 100))
        if (await checkHealth(url, password)) return
      }
    }

    await ready()
  })()

  return { listener, health: { wait } }
}

function resolveBundledNodePath() {
  const executable = process.platform === "win32" ? "wiscode-node.exe" : "wiscode-node"
  if (app.isPackaged) return join(process.resourcesPath, executable)

  const candidates = [
    join(app.getAppPath(), "resources", executable),
    join(app.getAppPath(), "..", "resources", executable),
    join(app.getAppPath(), "..", "..", "resources", executable),
    join(process.cwd(), "resources", executable),
  ]
  return candidates.find((item) => existsSync(item)) ?? candidates[0]
}

function prepareServerEnv(password: string) {
  const shell = process.platform === "win32" ? null : getUserShell()
  const shellEnv = shell ? (loadShellEnv(shell) ?? {}) : {}
  const bundledNode = resolveBundledNodePath()
  const env = {
    ...process.env,
    ...shellEnv,
    OPENCODE_EXPERIMENTAL_ICON_DISCOVERY: "true",
    OPENCODE_EXPERIMENTAL_FILEWATCHER: "true",
    OPENCODE_CLIENT: "desktop",
    OPENCODE_SERVER_USERNAME: "opencode",
    OPENCODE_SERVER_PASSWORD: password,
    XDG_STATE_HOME: app.getPath("userData"),
    ...(existsSync(bundledNode) ? { WISCODE_BUNDLED_NODE_PATH: bundledNode } : {}),
  }
  Object.assign(process.env, env)
}

export async function checkHealth(url: string, password?: string | null): Promise<boolean> {
  let healthUrl: URL
  try {
    healthUrl = new URL("/global/health", url)
  } catch {
    return false
  }

  const headers = new Headers()
  if (password) {
    const auth = Buffer.from(`opencode:${password}`).toString("base64")
    headers.set("authorization", `Basic ${auth}`)
  }

  try {
    const res = await fetch(healthUrl, {
      method: "GET",
      headers,
      signal: AbortSignal.timeout(3000),
    })
    return res.ok
  } catch {
    return false
  }
}
