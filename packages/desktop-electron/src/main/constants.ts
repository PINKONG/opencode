import { app } from "electron"

type Channel = "dev" | "beta" | "prod"
const raw = import.meta.env.OPENCODE_CHANNEL
export const CHANNEL: Channel = raw === "dev" || raw === "beta" || raw === "prod" ? raw : "dev"

export const SETTINGS_STORE = "opencode.settings"
export const DEFAULT_SERVER_URL_KEY = "defaultServerUrl"
export const WSL_ENABLED_KEY = "wslEnabled"
export const SIDECAR_EXPOSE_LAN_KEY = "sidecarExposeLan"
export const SIDECAR_PORT_KEY = "sidecarPort"
export const SIDECAR_PERSISTENT_PASSWORD_KEY = "sidecarPersistentPassword"
export const SIDECAR_FIXED_TOKEN_DEFAULT_PASSWORD = "123456"
export const UPDATER_ENABLED = app.isPackaged && CHANNEL !== "dev"
