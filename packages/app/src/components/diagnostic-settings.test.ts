import { expect, test } from "bun:test"
import {
  cleanupDiagnosticLogs,
  diagnosticCategoriesPatch,
  diagnosticCategoriesMatch,
  diagnosticLlmContentMatch,
  openDiagnosticDirectory,
  selectedDiagnosticCategories,
  updateDiagnosticCategory,
} from "./diagnostic-settings"
import { dict as en } from "../i18n/en"
import { dict as zh } from "../i18n/zh"
import { dict as zht } from "../i18n/zht"

test("diagnostic settings have localized navigation and privacy copy", () => {
  expect(en["settings.general.section.logs"]).toBe("Logs")
  expect(zh["settings.general.section.logs"]).toBe("日志")
  expect(zht["settings.general.section.logs"]).toBe("日誌")
  expect(zh["settings.logs.raw.confirm"]).toContain("API key")
  expect(en["settings.logs.raw.confirm"]).toContain("Nothing is redacted")
  expect(en["settings.logs.folder.unavailable"]).toContain("{{path}}")
  expect(zh["settings.logs.cleanup.failed"]).toContain("{{error}}")
  expect(zh["settings.logs.cleanup.confirm"]).toContain("今天")
  expect(en["settings.logs.cleanup.partial"]).toContain("{{skipped}}")
})

test("diagnostic categories default to all and null restores the unrestricted configuration", () => {
  expect(selectedDiagnosticCategories(undefined)).toHaveLength(7)
  expect(selectedDiagnosticCategories(["llm"])).toEqual(["llm"])
  expect(diagnosticCategoriesPatch(["llm"])).toEqual(["llm"])
  expect(diagnosticCategoriesPatch(null)).toBeNull()
  expect(diagnosticCategoriesPatch(selectedDiagnosticCategories(undefined))).toHaveLength(7)
})

test("diagnostic category saves reject servers silently ignoring category updates", () => {
  expect(diagnosticCategoriesMatch(null, ["llm"])).toBe(false)
  expect(diagnosticCategoriesMatch(["llm"], undefined)).toBe(false)
  expect(diagnosticCategoriesMatch(["llm"], ["tool"])).toBe(false)
  expect(diagnosticCategoriesMatch(null, undefined)).toBe(true)
  expect(diagnosticCategoriesMatch(["llm", "tool"], ["tool", "llm"])).toBe(true)
})

test("diagnostic llm content saves reject servers that omit or change the setting", () => {
  expect(diagnosticLlmContentMatch(true, true)).toBe(true)
  expect(diagnosticLlmContentMatch(false, false)).toBe(true)
  expect(diagnosticLlmContentMatch(true, false)).toBe(false)
  expect(diagnosticLlmContentMatch(false, true)).toBe(false)
  expect(diagnosticLlmContentMatch(false, undefined)).toBe(false)
  expect(diagnosticLlmContentMatch(true, undefined)).toBe(false)
  expect(diagnosticLlmContentMatch(false, null)).toBe(false)
  expect(diagnosticLlmContentMatch(false, 0)).toBe(false)
  expect(diagnosticLlmContentMatch(true, "true")).toBe(false)
})

test("diagnostic llm content has localized copy and errors", () => {
  expect(en["settings.logs.content.title"]).toBe("Model interaction content")
  expect(zh["settings.logs.content.title"]).toBe("模型交互内容")
  expect(zht["settings.logs.content.title"]).toBe("模型互動內容")
  for (const dict of [en, zh, zht]) {
    expect(dict["settings.logs.content.description"]).toBeTruthy()
    expect(dict["settings.logs.content.unsupported"]).toBeTruthy()
    expect(dict["settings.logs.content.failed"]).toContain("{{error}}")
  }
  for (const dict of [zh, zht]) {
    expect(dict["settings.logs.categories.unsupported"]).not.toBe(en["settings.logs.categories.unsupported"])
    expect(dict["settings.logs.categories.failed"]).not.toBe(en["settings.logs.categories.failed"])
    expect(dict["settings.logs.categories.failed"]).toContain("{{error}}")
  }
})

test("both desktop settings generations share verified content saves without optimistic state", async () => {
  const text = await Bun.file(new URL("./settings-logs.tsx", import.meta.url)).text()
  expect(text.match(/onChange=\{logs.updateContent\}/g)).toHaveLength(2)
  expect(text.match(/checked=\{logs.diagnostics\(\).llmContent \?\? false\}/g)).toHaveLength(2)
  expect(text.match(/disabled=\{logs.saving\(\)\}/g)).toHaveLength(14)
  expect(text).toContain("diagnosticLlmContentMatch(llmContent, result.data?.diagnostics?.llmContent)")
  expect(text).toContain("diagnostics: { ...diagnostics(), ...patch }")
})

test("diagnostic category selection cannot remove its last category", () => {
  expect(updateDiagnosticCategory(["llm"], "llm", false)).toEqual(["llm"])
  expect(updateDiagnosticCategory(["llm"], "tool", true)).toEqual(["llm", "tool"])
  expect(updateDiagnosticCategory(["llm", "tool"], "llm", false)).toEqual(["tool"])
})

test("opens the diagnostics directory through a desktop file manager", async () => {
  const paths: string[] = []
  const result = await openDiagnosticDirectory({
    status: async () => ({ root: "/tmp/diagnostics" }),
    reveal: async (path) => {
      paths.push(path)
      return true
    },
  })
  expect(result).toEqual({ root: "/tmp/diagnostics", opened: true })
  expect(paths).toEqual(["/tmp/diagnostics"])
})

test("returns an explicit path when a browser cannot open local folders", async () => {
  expect(await openDiagnosticDirectory({ status: async () => ({ root: "/tmp/diagnostics" }) })).toEqual({
    root: "/tmp/diagnostics",
    opened: false,
  })
})

test("does not clean diagnostic logs without confirmation", async () => {
  let calls = 0
  const cleaned = await cleanupDiagnosticLogs({
    confirm: () => false,
    cleanup: async () => {
      calls++
      return { deleted: 0, skipped: 0 }
    },
  })
  expect(cleaned).toBeUndefined()
  expect(calls).toBe(0)
})

test("returns the number of cleared and skipped diagnostic files", async () => {
  expect(
    await cleanupDiagnosticLogs({
      confirm: () => true,
      cleanup: async () => ({ deleted: 2, skipped: 1 }),
    }),
  ).toEqual({ deleted: 2, skipped: 1 })
})
