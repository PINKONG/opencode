import { describe, expect, test } from "bun:test"
import path from "path"

const root = path.resolve(import.meta.dirname, "../..")

describe("cli command branding", () => {
  test("exposes wiscode as the public npm bin command in the published wrapper package", async () => {
    const script = await Bun.file(path.join(root, "script/publish.ts")).text()

    expect(script).toContain('const cmd = "wiscode"')
    expect(script).toContain("[cmd]: `./bin/opencode`")
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
    expect(script).toContain('INSTALL_DIR=$HOME/.wiscode/bin')
    expect(script).toContain('command -v wiscode >/dev/null 2>&1')
    expect(script).toContain('installed_version=$(wiscode --version 2>/dev/null || echo "")')
    expect(script).toContain('mv "$tmp_dir/wiscode-cli" "${INSTALL_DIR}/wiscode"')
    expect(script).toContain('chmod 755 "${INSTALL_DIR}/wiscode"')
    expect(script).toContain('cp "$binary_path" "${INSTALL_DIR}/wiscode"')
    expect(script).toContain('cp "$resource_dir/$uv_name" "${INSTALL_DIR}/$uv_name"')
    expect(script).toContain('cp -R "$resource_dir/bmad" "${INSTALL_DIR}/bmad"')
    expect(script).toContain('echo -e "wiscode')
  })
})
