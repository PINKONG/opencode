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
})
