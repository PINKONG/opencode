import { describe, expect, test } from "bun:test"
import path from "path"

describe("httpapi description branding", () => {
  test("instance httpapi group descriptions do not expose old OpenCode branding", async () => {
    const groupsDir = path.join(import.meta.dir, "../../src/server/routes/instance/httpapi/groups")
    const files = await Array.fromAsync(new Bun.Glob("*.ts").scan({ cwd: groupsDir }))

    for (const file of files) {
      const text = await Bun.file(path.join(groupsDir, file)).text()
      expect(text).not.toContain("OpenCode")
    }
  })
})
