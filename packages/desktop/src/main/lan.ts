import type { NetworkInterfaceInfo } from "node:os"
import type { SidecarLanConfig } from "./sidecar-config"

export type SidecarHostStatus = "disabled" | "available" | "unavailable" | "custom_unavailable"

const virtualInterface = /bluetooth|docker|hyper-v|loopback|tap|tailscale|tun|virtual|vbox|vmware|vpn|wsl|zerotier/i

const privateIPv4 = (address: string) => {
  const parts = address.split(".").map((part) => Number.parseInt(part, 10))
  if (parts.length !== 4 || parts.some((part) => !Number.isInteger(part) || part < 0 || part > 255)) return false
  if (parts[0] === 10) return true
  if (parts[0] === 172 && parts[1] >= 16 && parts[1] <= 31) return true
  return parts[0] === 192 && parts[1] === 168
}

const listLanIPv4 = (interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>) =>
  Object.entries(interfaces)
    .filter(([name]) => !virtualInterface.test(name))
    .flatMap(([, list]) => list ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal && item.address !== "0.0.0.0")
    .filter((item) => privateIPv4(item.address))

export function resolveSidecarHosts(config: SidecarLanConfig, interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>) {
  if (!config.enabled) {
    return {
      bindHost: "127.0.0.1",
      clientHost: "127.0.0.1",
      advertiseHost: "127.0.0.1",
      healthHost: "127.0.0.1",
      status: "disabled" as const,
    }
  }

  const ipv4 = listLanIPv4(interfaces)
  const custom = config.addressMode === "custom" ? ipv4.find((item) => item.address === config.customAddress) : undefined
  const advertiseHost = (() => {
    if (config.addressMode === "custom") return custom?.address ?? "127.0.0.1"
    return ipv4[0]?.address ?? "127.0.0.1"
  })()
  const status: SidecarHostStatus = (() => {
    if (config.addressMode === "custom" && !custom) return "custom_unavailable"
    if (advertiseHost === "127.0.0.1") return "unavailable"
    return "available"
  })()

  return {
    bindHost: "0.0.0.0",
    clientHost: "127.0.0.1",
    advertiseHost,
    healthHost: "127.0.0.1",
    status,
  }
}
