import { describe, expect, test } from "bun:test"

const list = [
  ["../public/apple-touch-icon-v3.png", "../../ui/src/assets/favicon/apple-touch-icon-v3.png"],
  ["../public/apple-touch-icon.png", "../../ui/src/assets/favicon/apple-touch-icon.png"],
  ["../public/favicon-96x96-v3.png", "../../ui/src/assets/favicon/favicon-96x96-v3.png"],
  ["../public/favicon-96x96.png", "../../ui/src/assets/favicon/favicon-96x96.png"],
  ["../public/favicon-v3.ico", "../../ui/src/assets/favicon/favicon-v3.ico"],
  ["../public/favicon-v3.svg", "../../ui/src/assets/favicon/favicon-v3.svg"],
  ["../public/favicon.ico", "../../ui/src/assets/favicon/favicon.ico"],
  ["../public/favicon.svg", "../../ui/src/assets/favicon/favicon.svg"],
  ["../public/site.webmanifest", "../../ui/src/assets/favicon/site.webmanifest"],
  ["../public/social-share-zen.png", "../../ui/src/assets/images/social-share-zen.png"],
  ["../public/social-share.png", "../../ui/src/assets/images/social-share.png"],
  ["../public/web-app-manifest-192x192.png", "../../ui/src/assets/favicon/web-app-manifest-192x192.png"],
  ["../public/web-app-manifest-512x512.png", "../../ui/src/assets/favicon/web-app-manifest-512x512.png"],
] as const

const buf = async (path: string) => Buffer.from(await Bun.file(new URL(path, import.meta.url)).arrayBuffer())

describe("public assets", () => {
  test("mirror ui assets", async () => {
    await Promise.all(
      list.map(async ([pub, src]) => {
        expect((await buf(pub)).equals(await buf(src))).toBe(true)
      }),
    )
  })
})
