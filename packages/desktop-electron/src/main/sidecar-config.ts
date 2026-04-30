export type SidecarLanConfig = {
  enabled: boolean
  addressMode: "lan" | "custom"
  customAddress: string
  fixedPort?: number
  fixedToken?: boolean
}

function parsePort(value: unknown) {
  if (typeof value !== "number" || !Number.isInteger(value)) return
  if (value < 1 || value > 65535) return
  return value
}

export function normalizeSidecarLanConfig(input: unknown): SidecarLanConfig {
  if (typeof input === "boolean") {
    return {
      enabled: input,
      addressMode: "lan",
      customAddress: "",
      fixedToken: false,
    }
  }

  if (!input || typeof input !== "object") {
    return {
      enabled: false,
      addressMode: "lan",
      customAddress: "",
      fixedToken: false,
    }
  }

  const value = input as Record<string, unknown>
  const enabled = value.enabled === true
  const customAddress = typeof value.customAddress === "string" ? value.customAddress.trim() : ""
  const addressMode = value.addressMode === "custom" && customAddress ? "custom" : "lan"
  const fixedToken = value.fixedToken === true

  return {
    enabled,
    addressMode,
    customAddress: addressMode === "custom" ? customAddress : "",
    fixedToken,
    ...(parsePort(value.fixedPort) ? { fixedPort: parsePort(value.fixedPort) } : {}),
  }
}

export function resolveConfiguredPort(config: SidecarLanConfig, envPort: string | undefined) {
  const fromConfig = parsePort(config.fixedPort)
  if (fromConfig) return fromConfig
  if (!envPort) return
  const parsed = Number.parseInt(envPort, 10)
  return parsePort(parsed)
}
