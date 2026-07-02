import { describe, expect, test } from "bun:test"
import path from "path"

const root = path.resolve(import.meta.dirname, "../../../..")

async function read(file: string) {
  return Bun.file(path.join(root, file)).text()
}

describe("spinner registration", () => {
  test("local spinner component explicitly registers the OpenTUI spinner", async () => {
    const source = await read("packages/tui/src/component/spinner.tsx")

    expect(source).toContain('import { registerSpinner } from "opentui-spinner/solid"')
    expect(source).toContain("registerSpinner()")
  })

  test("other direct spinner element users import the local registration module", async () => {
    const files = [
      "packages/tui/src/component/prompt/index.tsx",
      "packages/opencode/src/cli/cmd/run/footer.view.tsx",
      "packages/opencode/src/cli/cmd/run/footer.subagent.tsx",
    ]

    for (const file of files) {
      const source = await read(file)
      expect(source).not.toContain('import "opentui-spinner/solid"')
      expect(source).toMatch(/@opencode-ai\/tui\/component\/spinner|["']\.\.\/spinner["']/)
    }
  })
})
