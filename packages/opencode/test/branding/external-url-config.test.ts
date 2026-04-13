import { afterEach, describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"
import { Product } from "../../src/product"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../../..")
const keys = [
  "WISCODE_API_URL",
  "WISCODE_APP_URL",
  "WISCODE_SITE_URL",
  "WISCODE_SITE_DEV_URL",
  "WISCODE_DOCS_URL",
  "WISCODE_INSTALL_URL",
  "WISCODE_AUTH_URL",
  "WISCODE_GITHUB_URL",
  "WISCODE_DISCORD_URL",
] as const
const prev = Object.fromEntries(keys.map((key) => [key, process.env[key]]))

afterEach(() => {
  for (const key of keys) {
    const value = prev[key]
    if (value === undefined) delete process.env[key]
    else process.env[key] = value
  }
})

describe("external url config", () => {
  test("uses stable defaults for product endpoints", () => {
    expect(Product.api()).toBe("https://api.opencode.ai")
    expect(Product.app()).toBe("https://app.opencode.ai")
    expect(Product.site()).toBe("https://opencode.ai")
    expect(Product.dev()).toBe("https://dev.opencode.ai")
    expect(Product.docs()).toBe("https://opencode.ai/docs")
    expect(Product.install()).toBe("https://opencode.ai/install")
    expect(Product.auth()).toBe("https://opencode.ai/auth")
    expect(Product.github()).toBe("https://github.com/PINKONG/opencode")
  })

  test("allows env overrides for product endpoints", () => {
    process.env.WISCODE_API_URL = "https://api.wiscode.example/"
    process.env.WISCODE_APP_URL = "https://app.wiscode.example/"
    process.env.WISCODE_SITE_URL = "https://wiscode.example/"
    process.env.WISCODE_SITE_DEV_URL = "https://preview.wiscode.example/"
    process.env.WISCODE_DOCS_URL = "https://docs.wiscode.example/"
    process.env.WISCODE_INSTALL_URL = "https://install.wiscode.example/"
    process.env.WISCODE_AUTH_URL = "https://auth.wiscode.example/"
    process.env.WISCODE_GITHUB_URL = "https://github.com/morewiscloud/wiscode/"

    expect(Product.api()).toBe("https://api.wiscode.example")
    expect(Product.app()).toBe("https://app.wiscode.example")
    expect(Product.site()).toBe("https://wiscode.example")
    expect(Product.dev()).toBe("https://preview.wiscode.example")
    expect(Product.docs()).toBe("https://docs.wiscode.example")
    expect(Product.install()).toBe("https://install.wiscode.example")
    expect(Product.auth()).toBe("https://auth.wiscode.example")
    expect(Product.github()).toBe("https://github.com/morewiscloud/wiscode")
  })

  test("runtime sources use shared product endpoint config", async () => {
    const github = await Bun.file(join(root, "packages/opencode/src/cli/cmd/github.ts")).text()
    const server = await Bun.file(join(root, "packages/opencode/src/server/instance.ts")).text()
    const web = await Bun.file(join(root, "packages/web/config.mjs")).text()

    expect(github).toContain('from "@/product"')
    expect(github).not.toContain("https://api.opencode.ai")
    expect(github).not.toContain("https://dev.opencode.ai")
    expect(github).not.toContain('const shareBaseUrl = isMock ? "https://dev.opencode.ai" : "https://opencode.ai"')

    expect(server).toContain('from "@/product"')
    expect(server).not.toContain("https://app.opencode.ai")

    expect(web).toContain("WISCODE_SITE_URL")
    expect(web).toContain("WISCODE_SITE_DEV_URL")
    expect(web).toContain("WISCODE_AUTH_URL")
    expect(web).toContain("WISCODE_GITHUB_URL")
    expect(web).toContain("https://github.com/PINKONG/opencode")
  })
})
