import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../src-tauri/tauri.prod.conf.json")
const betaFile = join(dir, "../src-tauri/tauri.beta.conf.json")
const hooksFile = join(dir, "../src-tauri/release/nsis-installer-hooks.nsh")
const cfg = JSON.parse(await Bun.file(file).text()) as {
  bundle?: {
    externalBin?: string[]
    windows?: {
      nsis?: {
        headerImage?: string
        sidebarImage?: string
        installerHooks?: string
      }
    }
  }
  plugins?: {
    updater?: {
      endpoints?: string[]
    }
  }
}
const hooks = await Bun.file(hooksFile).text()
const betaCfg = JSON.parse(await Bun.file(betaFile).text()) as {
  bundle?: {
    externalBin?: string[]
    windows?: {
      nsis?: {
        installerHooks?: string
      }
    }
  }
}

describe("tauri production config", () => {
  test("does not point updater at upstream opencode releases", () => {
    const list = cfg.plugins?.updater?.endpoints ?? []
    expect(list.length).toBeGreaterThan(0)
    for (const item of list) {
      expect(item).not.toContain("anomalyco/opencode")
      expect(item).toContain("latest.json")
    }
  })

  test("keeps branded nsis installer and uninstaller images in production config", () => {
    const nsis = cfg.bundle?.windows?.nsis
    expect(nsis?.headerImage).toBe("assets/nsis-header.bmp")
    expect(nsis?.sidebarImage).toBe("assets/nsis-sidebar.bmp")
    expect(nsis?.installerHooks).toBe("release/nsis-installer-hooks.nsh")
    expect(betaCfg.bundle?.windows?.nsis?.installerHooks).toBe("release/nsis-installer-hooks.nsh")
  })

  test("registers windows cli on post install and cleans on uninstall", () => {
    expect(hooks).toContain("!macro NSIS_HOOK_POSTINSTALL")
    expect(hooks).toContain("!macro NSIS_HOOK_POSTUNINSTALL")
    expect(hooks).toContain("wiscode.exe")
    expect(hooks).toContain("HKCU")
    expect(hooks).toContain("$INSTDIR\\resources\\wiscode-cli.exe")
    expect(hooks).toContain("Rebuild PATH by splitting on")
  })

  test("ships both cli and node sidecars", () => {
    expect(cfg.bundle?.externalBin).toBeDefined()
    expect(cfg.bundle?.externalBin).toContain("sidecars/wiscode-cli")
    expect(cfg.bundle?.externalBin).toContain("sidecars/wiscode-node")
  })

  test("ships both cli and node sidecars in beta config", () => {
    expect(betaCfg.bundle?.externalBin).toBeDefined()
    expect(betaCfg.bundle?.externalBin).toContain("sidecars/wiscode-cli")
    expect(betaCfg.bundle?.externalBin).toContain("sidecars/wiscode-node")
  })
})
