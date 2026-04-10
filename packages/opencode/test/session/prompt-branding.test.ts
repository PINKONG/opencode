import { describe, expect, test } from "bun:test"
import { dirname, join, resolve } from "node:path"
import { fileURLToPath } from "node:url"

const dir = dirname(fileURLToPath(import.meta.url))
const root = resolve(dir, "../../src/session/prompt")

const files = [
  "anthropic.txt",
  "beast.txt",
  "build-switch.txt",
  "codex.txt",
  "copilot-gpt-5.txt",
  "default.txt",
  "gemini.txt",
  "gpt.txt",
  "kimi.txt",
  "max-steps.txt",
  "plan.txt",
  "trinity.txt",
]

const intro = "You are WisCode, the industrial software AI coding assistant provided by Morewis, focused on software engineering tasks."
const zh =
  "我是WisCode，摩尔元数提供的工业软件AI编程助手，专注于软件工程任务。我可以帮你编写、编辑、搜索代码，运行命令，调试问题，开发新功能，并支持多任务并行处理。我简洁高效，直接回答问题，适合在命令行环境中使用。"

describe("session prompt branding", () => {
  for (const name of files) {
    test(`${name} does not expose old OpenCode branding`, async () => {
      const txt = await Bun.file(join(root, name)).text()

      expect(txt).not.toContain("OpenCode")
      if (!["anthropic.txt", "default.txt"].includes(name)) {
        expect(txt).not.toContain("opencode")
        expect(txt).not.toContain("opencode.ai")
      }
    })
  }

  for (const name of [
    "anthropic.txt",
    "beast.txt",
    "codex.txt",
    "copilot-gpt-5.txt",
    "default.txt",
    "gemini.txt",
    "gpt.txt",
    "kimi.txt",
    "trinity.txt",
  ]) {
    test(`${name} uses the WisCode self-introduction`, async () => {
      const txt = await Bun.file(join(root, name)).text()

      expect(txt).toContain(intro)
      expect(txt).toContain(zh)
    })
  }

  for (const name of ["anthropic.txt", "default.txt"]) {
    test(`${name} restores doc lookup guidance for product capability questions`, async () => {
      const txt = await Bun.file(join(root, name)).text()

      expect(txt).toContain("use the WebFetch tool")
      expect(txt).toContain("https://opencode.ai/docs")
      expect(txt).toContain("compatibility reference")
    })
  }
})
