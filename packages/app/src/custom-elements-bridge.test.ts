import { describe, expect, test } from "bun:test"

const text = () => Bun.file(new URL("./custom-elements.d.ts", import.meta.url)).text()

describe("custom elements bridge", () => {
  test("uses a shared reference file instead of a copied declaration", async () => {
    const file = await text()

    expect(file).toContain('/// <reference path="../../ui/src/custom-elements.d.ts" />')
    expect(file).not.toContain('declare module "solid-js"')
  })
})
