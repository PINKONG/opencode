import { describe, expect, test } from "bun:test"
import { resolveSidecarHosts } from "./lan"

describe("lan sidecar hosts", () => {
  test("uses loopback when lan exposure is disabled", () => {
    const result = resolveSidecarHosts({ enabled: false, addressMode: "lan" }, {
      en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
    })

    expect(result.bindHost).toBe("127.0.0.1")
    expect(result.clientHost).toBe("127.0.0.1")
    expect(result.advertiseHost).toBe("127.0.0.1")
  })

  test("binds all interfaces and advertises lan ip when enabled", () => {
    const result = resolveSidecarHosts({ enabled: true, addressMode: "lan" }, {
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
      en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
    })

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.clientHost).toBe("127.0.0.1")
    expect(result.advertiseHost).toBe("192.168.1.23")
    expect(result.status).toBe("available")
  })

  test("falls back to loopback advertise host when no lan ip is available", () => {
    const result = resolveSidecarHosts({ enabled: true, addressMode: "lan" }, {
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
    })

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("127.0.0.1")
    expect(result.status).toBe("unavailable")
  })

  test("prefers public-looking non-virtual addresses when they are the only lan option", () => {
    const result = resolveSidecarHosts({ enabled: true, addressMode: "lan" }, {
      Ethernet: [{ address: "190.160.9.212", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
      "Tailscale Tunnel": [
        { address: "100.64.1.20", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" },
      ],
      "vEthernet (WSL)": [
        { address: "172.20.48.1", family: "IPv4", internal: false, netmask: "255.255.240.0", mac: "" },
      ],
    })

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("190.160.9.212")
    expect(result.status).toBe("available")
  })

  test("ignores common virtual adapter names across windows mac and linux", () => {
    const result = resolveSidecarHosts({ enabled: true, addressMode: "lan" }, {
      "vEthernet (WSL)": [{ address: "172.20.48.1", family: "IPv4", internal: false, netmask: "255.255.240.0", mac: "" }],
      bridge0: [{ address: "192.168.122.1", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
      wg0: [{ address: "10.7.0.2", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
      en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
    })

    expect(result.advertiseHost).toBe("192.168.1.23")
    expect(result.status).toBe("available")
  })

  test("prioritizes configured custom lan address when present", () => {
    const result = resolveSidecarHosts(
      { enabled: true, addressMode: "custom", customAddress: "192.168.1.99" },
      {
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
        en0: [
          { address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" },
          { address: "192.168.1.99", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" },
        ],
      },
    )

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("192.168.1.99")
    expect(result.status).toBe("available")
  })

  test("does not advertise another address when configured custom address is unavailable", () => {
    const result = resolveSidecarHosts(
      { enabled: true, addressMode: "custom", customAddress: "192.168.1.200" },
      {
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
        en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
      },
    )

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("127.0.0.1")
    expect(result.status).toBe("custom_unavailable")
  })
})
