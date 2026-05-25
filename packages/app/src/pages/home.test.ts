import { describe, expect, test } from "bun:test"

describe("Home", () => {
  test("passes an explicit model selection state to the home model dialog", async () => {
    const text = await Bun.file(new URL("./home.tsx", import.meta.url)).text()
    expect(text).toContain('const model = useGlobalModelSelection()')
    expect(text).toContain('dialog.show(() => <DialogSelectModel model={model} />)')
  })
})
