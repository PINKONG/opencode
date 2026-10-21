export async function openDiagnosticDirectory(input: {
  status: () => Promise<{ root: string }>
  reveal?: (path: string) => Promise<boolean>
}) {
  const result = await input.status()
  return { root: result.root, opened: (await input.reveal?.(result.root)) ?? false }
}

export async function cleanupDiagnosticLogs(input: {
  confirm: () => boolean
  cleanup: () => Promise<{ deleted: number; skipped: number }>
}) {
  if (!input.confirm()) return
  return input.cleanup()
}
