import { expect, test } from "bun:test"
import { cleanupDiagnosticLogs, openDiagnosticDirectory } from "./diagnostic-settings"

test("opens the diagnostics directory through a desktop file manager", async () => {
  const paths: string[] = []
  const result = await openDiagnosticDirectory({
    status: async () => ({ root: "/tmp/diagnostics" }),
    reveal: async (path) => { paths.push(path); return true },
  })
  expect(result).toEqual({ root: "/tmp/diagnostics", opened: true })
  expect(paths).toEqual(["/tmp/diagnostics"])
})

test("returns an explicit path when a browser cannot open local folders", async () => {
  expect(await openDiagnosticDirectory({ status: async () => ({ root: "/tmp/diagnostics" }) }))
    .toEqual({ root: "/tmp/diagnostics", opened: false })
})

test("does not clean diagnostic logs without confirmation", async () => {
  let calls = 0
  const cleaned = await cleanupDiagnosticLogs({ confirm: () => false, cleanup: async () => { calls++; return {} } })
  expect(cleaned).toBe(false)
  expect(calls).toBe(0)
})
