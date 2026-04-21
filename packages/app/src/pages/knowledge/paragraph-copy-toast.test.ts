import { beforeAll, beforeEach, describe, expect, mock, test } from "bun:test"

const shown: unknown[] = []
const dismissed: number[] = []

let showParagraphCopyToast: typeof import("./paragraph-copy-toast").showParagraphCopyToast

beforeAll(async () => {
  mock.module("@opencode-ai/ui/toast", () => ({
    showToast: (opts: unknown) => {
      shown.push(opts)
      return shown.length
    },
    toaster: {
      dismiss: (id: number) => dismissed.push(id),
    },
  }))

  const mod = await import("./paragraph-copy-toast")
  showParagraphCopyToast = mod.showParagraphCopyToast
})

beforeEach(() => {
  shown.length = 0
  dismissed.length = 0
})

describe("paragraph copy toast", () => {
  test("uses a short duration and replaces the previous copy toast", () => {
    showParagraphCopyToast({ title: "Copied", variant: "success" })
    showParagraphCopyToast({ title: "Copied", variant: "success" })

    expect(shown).toEqual([
      { title: "Copied", variant: "success", duration: 1800 },
      { title: "Copied", variant: "success", duration: 1800 },
    ])
    expect(dismissed).toEqual([1])
  })
})
