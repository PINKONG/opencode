import { describe, expect, test } from "bun:test"
import path from "path"

const root = path.resolve(import.meta.dirname, "../..")

describe("cli command branding", () => {
  test("exposes wiscode as the public npm bin command", async () => {
    const pkg = await Bun.file(path.join(root, "package.json")).json()

    expect(pkg.bin).toEqual({
      wiscode: "./bin/opencode",
    })
  })

  test("publishes wiscode as the public npm package name", async () => {
    const script = await Bun.file(path.join(root, "script/publish.ts")).text()

    expect(script).toContain('const npm = "wiscode-ai"')
    expect(script).toContain("name: npm")
    expect(script).not.toContain('name: pkg.name + "-ai"')
  })

  test("installs wiscode as the user-facing shell command", async () => {
    const script = await Bun.file(path.join(root, "../../install")).text()

    expect(script).toContain('APP=wiscode-cli')
    expect(script).toContain('command -v wiscode >/dev/null 2>&1')
    expect(script).toContain('installed_version=$(wiscode --version 2>/dev/null || echo "")')
    expect(script).toContain('mv "$tmp_dir/wiscode-cli" "${INSTALL_DIR}/wiscode"')
    expect(script).toContain('chmod 755 "${INSTALL_DIR}/wiscode"')
    expect(script).toContain('cp "$binary_path" "${INSTALL_DIR}/wiscode"')
    expect(script).toContain('echo -e "wiscode')
  })
})
