import type { NetworkInterfaceInfo } from "node:os"
import type { SidecarLanConfig } from "./sidecar-config"

const listLanIPv4 = (interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>) =>
  Object.values(interfaces)
    .flatMap((list) => list ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal && item.address !== "0.0.0.0")

export function resolveSidecarHosts(config: SidecarLanConfig, interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>) {
  if (!config.enabled) {
    return {
      bindHost: "127.0.0.1",
      clientHost: "127.0.0.1",
      advertiseHost: "127.0.0.1",
      healthHost: "127.0.0.1",
    }
  }

  const ipv4 = listLanIPv4(interfaces)
  const preferred =
    config.addressMode === "custom"
      ? ipv4.find((item) => item.address === config.customAddress)?.address
      : undefined

  return {
    bindHost: "0.0.0.0",
    clientHost: "127.0.0.1",
    advertiseHost: preferred ?? ipv4[0]?.address ?? "127.0.0.1",
    healthHost: "127.0.0.1",
  }
}
