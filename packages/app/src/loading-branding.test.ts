import { describe, expect, test } from "bun:test"

const read = async (path: string) => Bun.file(new URL(path, import.meta.url)).text()

describe("sidecar loading branding", () => {
  test("uses WisCode splash while loading", async () => {
    const app = await read("./app.tsx")

    expect(app).toContain('<Splash class="w-16 h-20 opacity-50 animate-pulse" />')
    expect(app).not.toContain('<Logo class="w-32 opacity-50 animate-pulse" />')
  })
})
