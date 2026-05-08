import { describe, expect, test } from "bun:test"

const read = async () => Bun.file(new URL("./session/session-header.tsx", import.meta.url)).text()

describe("session header titlebar portal safety", () => {
  test("uses keyed Show mounts for titlebar portal targets", async () => {
    const text = await read()

    expect(text).toContain("<Show when={ownsTitlebar() && search() && centerMount()} keyed>")
    expect(text).toContain("<Show when={ownsTitlebar() && rightMount()} keyed>")
  })
})
