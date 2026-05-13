import type { NetworkInterfaceInfo } from "node:os"
import type { SidecarLanConfig } from "./sidecar-config"

export type SidecarHostStatus = "disabled" | "available" | "unavailable" | "custom_unavailable"

const virtualInterfaceName = /bluetooth|docker|hyper-v|loopback|tap|tailscale|tun|virtual|vbox|vmware|vpn|wsl|zerotier/i
const virtualInterfacePrefix = /^(?:bridge\d*|br[-\w]*|docker\d*|utun\d*|veth[\w-]*|virbr\d*|vEthernet\b|wg\d+|zt[\w-]*|awdl\d*|llw\d*)/i

const isVirtualInterface = (name: string) => virtualInterfaceName.test(name) || virtualInterfacePrefix.test(name)

const listLanIPv4 = (interfaces: NodeJS.Dict<NetworkInterfaceInfo[] | undefined>) =>
  Object.entries(interfaces)
    .filter(([name]) => !isVirtualInterface(name))
    .flatMap(([, list]) => list ?? [])
    .filter((item) => item.family === "IPv4" && !item.internal && item.address !== "0.0.0.0")

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
