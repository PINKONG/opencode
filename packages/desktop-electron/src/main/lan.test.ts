import { describe, expect, test } from "bun:test"
import { resolveSidecarHosts } from "./lan"

describe("lan sidecar hosts", () => {
  test("uses loopback when lan exposure is disabled", () => {
    const result = resolveSidecarHosts({ enabled: false, addressMode: "lan" }, {
      en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
    })

    expect(result.bindHost).toBe("127.0.0.1")
    expect(result.advertiseHost).toBe("127.0.0.1")
  })

  test("binds all interfaces and advertises lan ip when enabled", () => {
    const result = resolveSidecarHosts({ enabled: true, addressMode: "lan" }, {
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
      en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
    })

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("192.168.1.23")
  })

  test("falls back to loopback advertise host when no lan ip is available", () => {
    const result = resolveSidecarHosts({ enabled: true, addressMode: "lan" }, {
      lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
    })

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("127.0.0.1")
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
  })

  test("falls back to auto lan address when configured custom address is unavailable", () => {
    const result = resolveSidecarHosts(
      { enabled: true, addressMode: "custom", customAddress: "192.168.1.200" },
      {
        lo0: [{ address: "127.0.0.1", family: "IPv4", internal: true, netmask: "255.0.0.0", mac: "" }],
        en0: [{ address: "192.168.1.23", family: "IPv4", internal: false, netmask: "255.255.255.0", mac: "" }],
      },
    )

    expect(result.bindHost).toBe("0.0.0.0")
    expect(result.advertiseHost).toBe("192.168.1.23")
  })
})
