import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"
import { describe, expect, test } from "bun:test"
import { SIDECAR_BINARIES, getCurrentSidecar } from "../scripts/utils"

const dir = dirname(fileURLToPath(import.meta.url))
const file = join(dir, "../src-tauri/src/cli.rs")
const src = await Bun.file(file).text()

describe("tauri cli install path", () => {
  test("installs wiscode into the wiscode namespace", () => {
    expect(src).toContain('const CLI_INSTALL_DIR: &str = ".wiscode/bin";')
    expect(src).toContain(".wiscode/bin/wiscode")
    expect(src).not.toContain(".opencode/bin")
  })

  test("injects bundled node path into sidecar environment", () => {
    expect(src).toContain("WISCODE_BUNDLED_NODE_PATH")
    expect(src).toContain('get_bundled_node_path(app)')
  })

  test("filters bundled node path when spawning via WSL", () => {
    expect(src).toContain("if is_wsl_enabled(app)")
    expect(src).toContain('.filter(|(key, _)| key != "WISCODE_BUNDLED_NODE_PATH")')
  })

  test("package script runs pretauri hook for sidecar preparation", async () => {
    const pkg = await Bun.file(join(dir, "../package.json")).json()
    expect(pkg.scripts.pretauri).toBe("bun ./scripts/predev.ts")
    expect(pkg.scripts.tauri).toBe("tauri")
  })

  test("desktop sidecar util can resolve native target without env", () => {
    const sidecar = getCurrentSidecar()
    expect(SIDECAR_BINARIES.map((item) => item.rustTarget)).toContain(sidecar.rustTarget)
  })

  test("resolves bundled node with .exe suffix on windows", () => {
    expect(src).toContain('let executable = if cfg!(windows) {')
    expect(src).toContain('"wiscode-node.exe"')
    expect(src).toContain('"wiscode-node"')
  })

  test("supports windows cli installation flow", () => {
    expect(src).toContain('const INSTALL_SCRIPT_WINDOWS: &str = include_str!("../../../../install-windows.ps1");')
    expect(src).toContain('let temp_script = std::env::temp_dir().join("wiscode-install.ps1");')
    expect(src).not.toContain("CLI installation is only supported on macOS & Linux")
  })

  test("sync_cli auto-installs on windows when cli is missing", () => {
    expect(src).toContain("No CLI installation found on Windows, auto-installing")
    expect(src).toContain("Auto-installed CLI on Windows")
  })

  test("sync_cli repairs PATH on windows by reading registry not process env", () => {
    expect(src).toContain("windows_user_path_contains")
    expect(src).toContain("CLI binary exists but bin dir missing from user PATH registry, repairing")
    expect(src).toContain("Repaired CLI PATH on Windows")
  })

  test("sync_cli reinstalls on windows when --version fails", () => {
    expect(src).toContain("CLI --version failed, attempting reinstall")
    expect(src).toContain("Reinstalled CLI after --version failure")
  })
})
