import { randomUUID } from "node:crypto"
import { mkdirSync, rmSync } from "node:fs"
import * as http from "node:http"
import { createServer } from "node:net"
import { networkInterfaces } from "node:os"
import { homedir, tmpdir } from "node:os"
import { join } from "node:path"
import { getCACertificates, setDefaultCACertificates } from "node:tls"
import type { Event } from "electron"
import { app, BrowserWindow } from "electron"
import { Deferred, Effect, Fiber } from "effect"
import contextMenu from "electron-context-menu"
import type { FatalRendererError, ServerReadyData, SidecarLanConfig, SidecarLanStatus } from "../preload/types"
import { checkAppExists, resolveAppPath } from "./apps"
import { installCli, syncCli, syncRipgrep } from "./cli"
import { CHANNEL, SIDECAR_FIXED_TOKEN_DEFAULT_PASSWORD } from "./constants"
import { registerIpcHandlers, sendDeepLinks, sendMenuCommand } from "./ipc"
import { forwardInitializationFailure } from "./initialization"
import { resolveSidecarHosts } from "./lan"
import { exportDebugLogs, initCrashReporter, initLogging, startNetLog, write as writeLog } from "./logging"
import { parseMarkdown } from "./markdown"
import { createMenu } from "./menu"
import { migrate } from "./migrate"
import { resolveConfiguredPort } from "./sidecar-config"
import {
  getDefaultServerUrl,
  getSidecarLanConfig,
  preferAppEnv,
  setDefaultServerUrl,
  setSidecarLanConfig,
  spawnLocalServer,
  type SidecarListener,
} from "./server"
import { setupAutoUpdater, showUpdaterDialog } from "./updater"
import { createMainWindow, registerRendererProtocol, setBackgroundColor, setDockIcon, setRelaunchHandler } from "./windows"
import { registerWslIpcHandlers } from "./wsl/ipc"
import { createWslServersController } from "./wsl/servers"
import { spawnWslSidecar } from "./wsl/sidecar"

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

let logger: ReturnType<typeof initLogging>
let mainWindow: BrowserWindow | null = null
let server: SidecarListener | null = null
let sidecarLanStatus: SidecarLanStatus = {
  enabled: false,
  status: "disabled",
  address: null,
  url: null,
  port: null,
}

const pendingDeepLinks: string[] = []

function useEnvProxy() {
  try {
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

function focusMainWindow() {
  if (!mainWindow) return
  mainWindow.show()
  mainWindow.focus()
}

const main = Effect.gen(function* () {
  contextMenu({ showSaveImageAs: true, showLookUpSelection: false, showSearchWithGoogle: false })

  try {
    process.chdir(homedir())
  } catch {}

  const appId = app.isPackaged ? APP_IDS[CHANNEL] : "ai.wiscode.desktop.dev"
  const onboardingTestRoot = (() => {
    if (!TEST_ONBOARDING) return

    const root = join(tmpdir(), `wiscode-onboarding-${randomUUID()}`)
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
  })()

  app.setName(app.isPackaged ? APP_NAMES[CHANNEL] : "WisCode Dev")
  app.setAppUserModelId(appId)
  app.setPath(
    "userData",
    onboardingTestRoot ? join(onboardingTestRoot, "desktop") : join(app.getPath("appData"), appId),
  )
  if (onboardingTestRoot) app.setPath("sessionData", join(onboardingTestRoot, "session"))

  logger = initLogging()
  initCrashReporter()

  const wslServers = createWslServersController(
    app.getVersion(),
    async (distro) => {
      logger.log("spawning wsl sidecar", { distro })
      return spawnWslSidecar(distro, {
        onLine: (line) => logger.log("wsl sidecar", { distro, stream: line.stream, text: line.text }),
      })
    },
    {
      logger: {
        log: (message, meta) => logger.log(message, meta),
        error: (message, meta) => logger.error(message, meta),
      },
    },
  )
  const stopSidecars = async () => {
    await killSidecar()
    wslServers.stopAll()
  }
  const relaunch = () => {
    void stopSidecars().finally(() => {
      app.relaunch()
      app.exit(0)
    })
  }

  try {
    setDefaultCACertificates([...new Set([...getCACertificates("default"), ...getCACertificates("system")])])
  } catch (error) {
    logger.warn("failed to load system certificates", error)
  }

  logger.log("app starting", {
    version: app.getVersion(),
    packaged: app.isPackaged,
    onboardingTest: Boolean(onboardingTestRoot),
  })

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
    void stopSidecars()
  })

  app.on("will-quit", () => {
    void stopSidecars()
  })

  app.on("child-process-gone", (_event, details) => {
    writeLog("utility", "child process gone", { details }, "error")
  })

  app.on("render-process-gone", (_event, webContents, details) => {
    writeLog("window", "app render process gone", { url: webContents.getURL(), details }, "error")
  })

  setRelaunchHandler(() => {
    relaunch()
  })

  for (const signal of ["SIGINT", "SIGTERM"] as const) {
    process.on(signal, () => {
      void stopSidecars().finally(() => app.exit(0))
    })
  }

  const serverReady = Deferred.makeUnsafe<ServerReadyData, unknown>()

  yield* Effect.promise(() => app.whenReady())

  if (!TEST_ONBOARDING) migrate()
  app.setAsDefaultProtocolClient("wiscode")
  registerRendererProtocol()
  setDockIcon()

  yield* Effect.promise(() => syncCli()).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to sync cli", error)
      }),
    ),
  )
  yield* Effect.promise(() => syncRipgrep()).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to sync ripgrep", error)
      }),
    ),
  )

  const updater = setupAutoUpdater(stopSidecars)
  registerIpcHandlers({
    killSidecar: () => killSidecar(),
    relaunch,
    installCli: () => installCli(),
    awaitInitialization: Effect.fnUntraced(
      function* () {
        logger.log("awaiting server ready")
        const res = yield* Deferred.await(serverReady)
        logger.log("server ready", { url: res.url })
        return res
      },
      (effect) => Effect.runPromise(effect),
    ),
    consumeInitialDeepLinks: () => pendingDeepLinks.splice(0),
    getDefaultServerUrl: () => getDefaultServerUrl(),
    setDefaultServerUrl: (url) => setDefaultServerUrl(url),
    getSidecarLanConfig: () => getSidecarLanConfig(),
    setSidecarLanConfig: (config: SidecarLanConfig) => setSidecarLanConfig(config),
    getSidecarLanStatus: () => sidecarLanStatus,
    getDisplayBackend: async () => null,
    setDisplayBackend: async () => undefined,
    parseMarkdown: async (markdown) => parseMarkdown(markdown),
    checkAppExists: (appName) => checkAppExists(appName),
    resolveAppPath: async (appName) => resolveAppPath(appName),
    updater,
    showUpdater: () => showUpdaterDialog(updater, true),
    setBackgroundColor: (color) => setBackgroundColor(color),
    exportDebugLogs: () => exportDebugLogs(),
    recordFatalRendererError: (error: FatalRendererError) =>
      writeLog("renderer", "fatal renderer error", { ...error }, "error"),
  })
  registerWslIpcHandlers(wslServers)
  void updater.start()
  const updateTimer = setInterval(() => void updater.check(), 10 * 60 * 1000)
  updateTimer.unref()
  app.once("will-quit", () => clearInterval(updateTimer))

  yield* Effect.promise(() => startNetLog()).pipe(
    Effect.catch((error) =>
      Effect.sync(() => {
        logger.warn("failed to start net log", error)
      }),
    ),
  )

  const config = getSidecarLanConfig()
  const hosts = resolveSidecarHosts(config, networkInterfaces())
  const port = yield* Effect.promise(() => getSidecarPort(config))
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

  const loadingTask = yield* Effect.gen(function* () {
    logger.log("sidecar connection started", { url, advertiseUrl })

    ensureLoopbackNoProxy()
    useEnvProxy()

    logger.log("spawning sidecar", { url, advertiseUrl, bindHost: hosts.bindHost })
    const { listener, health } = yield* Effect.promise(() =>
      spawnLocalServer(hosts.bindHost, port, password, {
        userDataPath: app.getPath("userData"),
        healthHost: hosts.healthHost,
        onStdout: (message) => writeLog("server", "stdout", { message }),
        onStderr: (message) => writeLog("server", "stderr", { message }, "warn"),
        onExit: (code) => writeLog("utility", "sidecar exited", { code }, "warn"),
      }),
    )
    server = listener
    yield* Deferred.succeed(serverReady, {
      url,
      displayUrl: hosts.status === "available" ? advertiseUrl : null,
      username: "opencode",
      password,
    })

    if (process.platform === "win32") {
      void wslServers.initialize().catch((error) => logger.error("wsl server initialization failed", error))
    }

    yield* Effect.promise(() => health.wait).pipe(
      Effect.timeout("30 seconds"),
      Effect.catch((error) =>
        Effect.sync(() => {
          logger.error("sidecar health check failed", error.toString())
        }),
      ),
    )

    logger.log("loading task finished")
  }).pipe(forwardInitializationFailure(serverReady), Effect.forkChild)

  yield* Fiber.await(loadingTask)

  mainWindow = createMainWindow()
  if (mainWindow) {
    createMenu({
      trigger: (id) => {
        const win = BrowserWindow.getFocusedWindow() ?? mainWindow
        if (win) sendMenuCommand(win, id)
      },
      checkForUpdates: () => {
        void showUpdaterDialog(updater, true)
      },
      relaunch,
    })
  }
})

Effect.runFork(main)

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
