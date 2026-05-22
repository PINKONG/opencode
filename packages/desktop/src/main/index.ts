import { randomUUID } from "node:crypto"
import { EventEmitter } from "node:events"
import { existsSync, mkdirSync, rmSync } from "node:fs"
import * as http from "node:http"
import { createServer } from "node:net"
import { networkInterfaces } from "node:os"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import type { Event } from "electron"
import { app, BrowserWindow } from "electron"
import contextMenu from "electron-context-menu"

import type {
  InitStep,
  FatalRendererError,
  ServerReadyData,
  SidecarLanConfig,
  SidecarLanStatus,
  SqliteMigrationProgress,
  WslConfig,
} from "../preload/types"
import { checkAppExists, resolveAppPath, wslPath } from "./apps"
import { installCli, syncCli } from "./cli"
import { CHANNEL, SIDECAR_FIXED_TOKEN_DEFAULT_PASSWORD, UPDATER_ENABLED } from "./constants"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand, sendSqliteMigrationProgress } from "./ipc"
import { resolveSidecarHosts } from "./lan"
import { exportDebugLogs, initCrashReporter, initLogging, startNetLog, write as writeLog } from "./logging"
import { parseMarkdown } from "./markdown"
import { createMenu } from "./menu"
import { migrate } from "./migrate"
import { resolveConfiguredPort } from "./sidecar-config"
import {
  getDefaultServerUrl,
  getSidecarLanConfig,
  getWslConfig,
  preferAppEnv,
  setDefaultServerUrl,
  setSidecarLanConfig,
  setWslConfig,
  spawnLocalServer,
  type SidecarListener,
} from "./server"
import { checkUpdate, checkForUpdates, installUpdate, setupAutoUpdater } from "./updater"
import {
  createLoadingWindow,
  createMainWindow,
  registerRendererProtocol,
  setBackgroundColor,
  setDockIcon,
  setRelaunchHandler,
} from "./windows"

contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })

// on macOS apps run in `/` which can cause issues with ripgrep
try {
  process.chdir(homedir())
} catch {}

const APP_NAMES: Record<string, string> = {
  dev: "WisCode Dev",
  beta: "WisCode Beta",
  prod: "WisCode",
}
const APP_IDS: Record<string, string> = {
  dev: "ai.wiscode.desktop.dev",
  beta: "ai.wiscode.desktop.beta",
  prod: "ai.wiscode.desktop",
}
const TEST_ONBOARDING = process.env.OPENCODE_TEST_ONBOARDING === "1"
const jsCallStackFeature = "DocumentPolicyIncludeJSCallStacksInCrashReports"

process.env.OPENCODE_DISABLE_EMBEDDED_WEB_UI = "true"

const appId = app.isPackaged ? APP_IDS[CHANNEL] : "ai.wiscode.desktop.dev"
const onboardingTestRoot = setupOnboardingTestEnv()
app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "WisCode Dev")
app.setAppUserModelId(appId)
app.setPath("userData", onboardingTestRoot ? join(onboardingTestRoot, "desktop") : join(app.getPath("appData"), appId))
if (onboardingTestRoot) app.setPath("sessionData", join(onboardingTestRoot, "session"))

const logger = initLogging()
initCrashReporter()

const initEmitter = new EventEmitter()
let initStep: InitStep = { phase: "server_waiting" }

let mainWindow: BrowserWindow | null = null
let server: SidecarListener | null = null
const loadingComplete = defer<void>()

const pendingDeepLinks: string[] = []

const serverReady = defer<ServerReadyData>()
let sidecarLanStatus: SidecarLanStatus = {
  enabled: false,
  status: "disabled",
  address: null,
  url: null,
  port: null,
}

useSystemCertificates()

logger.log("app starting", {
  version: app.getVersion(),
  packaged: app.isPackaged,
  onboardingTest: Boolean(onboardingTestRoot),
})

setupApp()

function setupOnboardingTestEnv() {
  if (!TEST_ONBOARDING) return

  const root = join(tmpdir(), `opencode-onboarding-${randomUUID()}`)
  rmSync(root, { recursive: true, force: true })
  ;["data", "config", "cache", "state", "desktop", "session"].forEach((dir) =>
    mkdirSync(join(root, dir), { recursive: true }),
  )
  process.env.OPENCODE_DB = ":memory:"
  process.env.XDG_DATA_HOME = join(root, "data")
  process.env.XDG_CONFIG_HOME = join(root, "config")
  process.env.XDG_CACHE_HOME = join(root, "cache")
  process.env.XDG_STATE_HOME = join(root, "state")
  return root
}

function setupApp() {
  ensureLoopbackNoProxy()
  useEnvProxy()
  app.commandLine.appendSwitch("proxy-bypass-list", "<-loopback>")
  const features = app.commandLine.getSwitchValue("enable-features")
  app.commandLine.appendSwitch("enable-features", features ? `${jsCallStackFeature},${features}` : jsCallStackFeature)
  if (!app.isPackaged) app.commandLine.appendSwitch("remote-debugging-port", "9222")

  if (!app.requestSingleInstanceLock()) {
    app.quit()
    return
  }

  preferAppEnv(app.getPath("userData"))

  app.on("second-instance", (_event: Event, argv: string[]) => {
    const urls = argv.filter((arg: string) => arg.startsWith("wiscode://"))
    if (urls.length) {
      logger.log("deep link received via second-instance", { urls })
      emitDeepLinks(urls)
    }
    focusMainWindow()
  })

  app.on("open-url", (event: Event, url: string) => {
    event.preventDefault()
    logger.log("deep link received via open-url", { url })
    emitDeepLinks([url])
  })

  app.on("before-quit", () => {
    void killSidecar()
  })

  app.on("will-quit", () => {
    void killSidecar()
  })

  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })

  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: webContents.getURL(), details }, "error")
  })

  setRelaunchHandler(() => {
    void killSidecar().finally(() => {
      app.relaunch()
      app.exit(0)
    })
  })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void killSidecar().finally(() => app.exit(0))
    })
  }

  registerIpcHandlers({
    killSidecar: () => killSidecar(),
    installCli: () => installCli(),
    awaitInitialization: async (sendStep) => {
      sendStep(initStep)
      const listener = (step: InitStep) => sendStep(step)
      initEmitter.on("step", listener)
      try {
        logger.log("awaiting server ready")
        const res = await serverReady.promise
        logger.log("server ready", { url: res.url })
        return res
      } finally {
        initEmitter.off("step", listener)
      }
    },
    getWindowConfig: () => ({ updaterEnabled: UPDATER_ENABLED }),
    consumeInitialDeepLinks: () => pendingDeepLinks.splice(0),
    getDefaultServerUrl: () => getDefaultServerUrl(),
    setDefaultServerUrl: (url) => setDefaultServerUrl(url),
    getWslConfig: () => Promise.resolve(getWslConfig()),
    setWslConfig: (config: WslConfig) => setWslConfig(config),
    getSidecarLanConfig: () => Promise.resolve(getSidecarLanConfig()),
    setSidecarLanConfig: (config: SidecarLanConfig) => setSidecarLanConfig(config),
    getSidecarLanStatus: () => sidecarLanStatus,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => undefined,
    parseMarkdown: async (markdown) => parseMarkdown(markdown),
    checkAppExists: async (appName) => checkAppExists(appName),
    wslPath: async (path, mode) => wslPath(path, mode),
    resolveAppPath: async (appName) => resolveAppPath(appName),
    loadingWindowComplete: () => loadingComplete.resolve(),
    runUpdater: async (alertOnFail) => checkForUpdates(alertOnFail, killSidecar),
    checkUpdate: async () => checkUpdate(),
    installUpdate: async () => installUpdate(killSidecar),
    setBackgroundColor: (color) => setBackgroundColor(color),
    exportDebugLogs: () => exportDebugLogs(),
    recordFatalRendererError: (error: FatalRendererError) =>
      writeLog("renderer", "fatal renderer error", { ...error }, "error"),
  })

  void app.whenReady().then(async () => {
    if (!TEST_ONBOARDING) migrate()
    app.setAsDefaultProtocolClient("wiscode")
    registerRendererProtocol()
    setDockIcon()
    setupAutoUpdater()
    void startNetLog().catch((error) => {
      logger.warn("failed to start net log", error)
    })
    await syncCli()
    await initialize()
  })
}

function useSystemCertificates() {
  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }
}

function useEnvProxy() {
  try {
    // Electron 41.2 runs Node 24.14.1; latest @types/node@24 is 24.12.2.
    ;(http as any).setGlobalProxyFromEnv()
  } catch (error) {
    logger.warn("failed to load proxy environment", error)
  }
}

function emitDeepLinks(urls: string[]) {
  if (urls.length === 0) return
  pendingDeepLinks.push(...urls)
  if (mainWindow) sendDeepLinks(mainWindow, urls)
}

function focusMainWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

function setInitStep(step: InitStep) {
  initStep = step
  logger.log("init step", { step })
  initEmitter.emit("step", step)
}

async function initialize() {
  const needsMigration = !sqliteFileExists()
  let overlay: BrowserWindow | null = null

  const config = getSidecarLanConfig()
  const port = await getSidecarPort(config)
  const hosts = resolveSidecarHosts(config, networkInterfaces())
  const url = `http://${hosts.clientHost}:${port}`
  const advertiseUrl = `http://${hosts.advertiseHost}:${port}`
  sidecarLanStatus = {
    enabled: config.enabled,
    status: hosts.status,
    address: hosts.status === "available" ? hosts.advertiseHost : null,
    url: hosts.status === "available" ? advertiseUrl : null,
    port,
  }
  const password =
    config.fixedToken === true
      ? process.env.OPENCODE_SERVER_PASSWORD || SIDECAR_FIXED_TOKEN_DEFAULT_PASSWORD
      : randomUUID()

  const loadingTask = (async () => {
    logger.log("sidecar connection started", { url, advertiseUrl, healthHost: hosts.healthHost })

    initEmitter.on("sqlite", (progress: SqliteMigrationProgress) => {
      setInitStep({ phase: "sqlite_waiting" })
      if (overlay) sendSqliteMigrationProgress(overlay, progress)
      if (mainWindow) sendSqliteMigrationProgress(mainWindow, progress)
    })

    logger.log("spawning sidecar", { url, advertiseUrl, bindHost: hosts.bindHost })
    const { listener, health } = await spawnLocalServer(
      hosts.bindHost,
      port,
      password,
      () => {
        ensureLoopbackNoProxy()
        useEnvProxy()
      },
      {
        needsMigration,
        userDataPath: app.getPath("userData"),
        healthHost: hosts.healthHost,
        onSqliteProgress: (progress) => initEmitter.emit("sqlite", progress),
        onStdout: (message) => writeLog("server", "stdout", { message }),
        onStderr: (message) => writeLog("server", "stderr", { message }, "warn"),
        onExit: (code) => writeLog("utility", "sidecar exited", { code }, "warn"),
      },
    )
    server = listener
    serverReady.resolve({
      url,
      displayUrl: hosts.status === "available" ? advertiseUrl : null,
      username: "opencode",
      password,
    })

    await Promise.race([
      health.wait,
      delay(30_000).then(() => {
        throw new Error("Sidecar health check timed out")
      }),
    ]).catch((error) => {
      logger.error("sidecar health check failed", error)
    })

    logger.log("loading task finished")
  })()

  if (needsMigration) {
    const show = await Promise.race([loadingTask.then(() => false), delay(1_000).then(() => true)])
    if (show) {
      overlay = createLoadingWindow()
      await delay(1_000)
    }
  }

  await loadingTask
  setInitStep({ phase: "done" })

  if (overlay) {
    await loadingComplete.promise
  }

  mainWindow = createMainWindow()
  wireMenu()

  overlay?.close()
}

function wireMenu() {
  if (!mainWindow) return
  createMenu({
    trigger: (id) => {
      const win = BrowserWindow.getFocusedWindow() ?? mainWindow
      if (win) sendMenuCommand(win, id)
    },
    checkForUpdates: () => {
      void checkForUpdates(true, killSidecar)
    },
    relaunch: () => {
      void killSidecar().finally(() => {
        app.relaunch()
        app.exit(0)
      })
    },
  })
}

async function killSidecar() {
  if (!server) return
  const current = server
  server = null
  await current.stop()
}

function ensureLoopbackNoProxy() {
  const loopback = ["127.0.0.1", "localhost", "::1"]
  const upsert = (key: string) => {
    const items = (process.env[key] ?? "")
      .split(",")
      .map((value: string) => value.trim())
      .filter((value: string) => Boolean(value))

    for (const host of loopback) {
      if (items.some((value: string) => value.toLowerCase() === host)) continue
      items.push(host)
    }

    process.env[key] = items.join(",")
  }

  upsert("NO_PROXY")
  upsert("no_proxy")
}

async function getSidecarPort(config: SidecarLanConfig) {
  const configured = resolveConfiguredPort(config, process.env.OPENCODE_PORT)
  if (configured) return configured

  return await new Promise<number>((resolve, reject) => {
    const server = createServer()
    server.on("error", reject)
    server.listen(0, "127.0.0.1", () => {
      const address = server.address()
      if (typeof address !== "object" || !address) {
        server.close()
        reject(new Error("Failed to get port"))
        return
      }
      const port = address.port
      server.close(() => resolve(port))
    })
  })
}

function sqliteFileExists() {
  if (process.env.OPENCODE_DB === ":memory:") return true

  const xdg = process.env.XDG_DATA_HOME
  const base = xdg && xdg.length > 0 ? xdg : join(homedir(), ".local", "share")
  return existsSync(join(base, "wiscode", "wiscode.db"))
}

function delay(ms: number) {
  return new Promise((resolve) => setTimeout(resolve, ms))
}

function defer<T>() {
  let resolve!: (value: T) => void
  let reject!: (error: Error) => void
  const promise = new Promise<T>((res, rej) => {
    resolve = res
    reject = rej
  })
  return { promise, resolve, reject }
}
