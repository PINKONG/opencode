import { expect, test } from "bun:test"
import { cleanupDiagnosticLogs, openDiagnosticDirectory } from "./diagnostic-settings"
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
