import { describe, expect, test } from "bun:test"
import { resolveLocalCommand } from "../../src/mcp/local-command"

describe("mcp local command resolution", () => {
  test("uses bundled node when command starts with node", () => {
    const out = resolveLocalCommand({
      command: ["node", "server.js"],
      env: { PATH: "/usr/bin:/bin" },
      bundledNodePath: "/opt/wiscode/node",
      bundledNodeUsable: true,
      pathDelimiter: ":",
    })

    expect(out.command[0]).toBe("/opt/wiscode/node")
    expect(out.command[1]).toBe("server.js")
    expect(out.resolution).toBe("bundled")
    expect(out.env.PATH).toBe("/opt/wiscode:/usr/bin:/bin")
  })

  test("falls back to system node when bundled node is unavailable", () => {
    const out = resolveLocalCommand({
      command: ["node", "server.js"],
      env: { PATH: "/usr/bin:/bin" },
      bundledNodePath: "/opt/wiscode/node",
      bundledNodeUsable: false,
      pathDelimiter: ":",
    })

    expect(out.command[0]).toBe("node")
    expect(out.resolution).toBe("system")
    expect(out.env.PATH).toBe("/usr/bin:/bin")
  })

  test("keeps system node and does not prefix path when bundled node is disabled", () => {
    const out = resolveLocalCommand({
      command: ["node", "server.js"],
      env: { PATH: "/usr/bin:/bin" },
      bundledNodePath: "/opt/wiscode/node",
      bundledNodeUsable: true,
      bundledNodeDisabled: true,
      pathDelimiter: ":",
    })

    expect(out.command[0]).toBe("node")
    expect(out.resolution).toBe("system")
    expect(out.env.PATH).toBe("/usr/bin:/bin")
  })

  test("prefixes PATH for shebang scripts when bundled node is available", () => {
    const out = resolveLocalCommand({
      command: ["./run-mcp"],
      env: { PATH: "/usr/bin:/bin" },
      bundledNodePath: "/opt/wiscode/node",
      bundledNodeUsable: true,
      pathDelimiter: ":",
    })

    expect(out.command[0]).toBe("./run-mcp")
    expect(out.resolution).toBe("shebang")
    expect(out.env.PATH).toBe("/opt/wiscode:/usr/bin:/bin")
  })

  test("matches node.exe and keeps existing path key casing", () => {
    const out = resolveLocalCommand({
      command: ["node.exe", "server.js"],
      env: { Path: "C:\\Windows\\System32" },
      bundledNodePath: "C:\\WisCode\\node.exe",
      bundledNodeUsable: true,
      pathDelimiter: ";",
    })

    expect(out.command[0]).toBe("C:\\WisCode\\node.exe")
    expect(out.resolution).toBe("bundled")
    expect(out.env.Path).toBe("C:\\WisCode;C:\\Windows\\System32")
    expect(out.env.PATH).toBeUndefined()
  })
})
