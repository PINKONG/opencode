import { describe, expect, test } from "bun:test"
import { normalizeSidecarLanConfig, resolveConfiguredPort } from "./sidecar-config"

describe("sidecar lan config", () => {
  test("returns defaults for invalid input", () => {
    expect(normalizeSidecarLanConfig(undefined)).toEqual({
      enabled: false,
      addressMode: "lan",
      customAddress: "",
      fixedToken: false,
    })
  })

  test("keeps valid custom mode and trims custom address", () => {
    expect(
      normalizeSidecarLanConfig({
        enabled: true,
        addressMode: "custom",
        customAddress: " 192.168.1.55 ",
      }),
    ).toEqual({
      enabled: true,
      addressMode: "custom",
      customAddress: "192.168.1.55",
      fixedToken: false,
    })
  })

  test("falls back to lan mode when custom mode has empty address", () => {
    expect(
      normalizeSidecarLanConfig({
        enabled: true,
        addressMode: "custom",
        customAddress: "   ",
      }),
    ).toEqual({
      enabled: true,
      addressMode: "lan",
      customAddress: "",
      fixedToken: false,
    })
  })

  test("keeps fixed token flag when enabled", () => {
    expect(
      normalizeSidecarLanConfig({
        enabled: true,
        addressMode: "lan",
        customAddress: "",
        fixedToken: true,
      }),
    ).toEqual({
      enabled: true,
      addressMode: "lan",
      customAddress: "",
      fixedToken: true,
    })
  })

  test("resolves fixed port from config first", () => {
    const port = resolveConfiguredPort(
      {
        enabled: true,
        addressMode: "lan",
        customAddress: "",
        fixedPort: 51515,
      },
      "62000",
    )
    expect(port).toBe(51515)
  })

  test("falls back to OPENCODE_PORT when fixed port is absent", () => {
    const port = resolveConfiguredPort(
      {
        enabled: true,
        addressMode: "lan",
        customAddress: "",
      },
      "62000",
    )
    expect(port).toBe(62000)
  })

  test("returns undefined for invalid ports", () => {
    const fromConfig = resolveConfiguredPort(
      {
        enabled: true,
        addressMode: "lan",
        customAddress: "",
        fixedPort: 70000,
      },
      undefined,
    )
    const fromEnv = resolveConfiguredPort(
      {
        enabled: true,
        addressMode: "lan",
        customAddress: "",
      },
      "0",
    )
    expect(fromConfig).toBeUndefined()
    expect(fromEnv).toBeUndefined()
  })
})
