export const DIAGNOSTIC_CATEGORIES = ["task", "processing", "llm", "tool", "knowledge", "plugin", "context"] as const
export type DiagnosticCategory = (typeof DIAGNOSTIC_CATEGORIES)[number]

export function selectedDiagnosticCategories(categories: readonly DiagnosticCategory[] | undefined) {
  return categories ? [...categories] : [...DIAGNOSTIC_CATEGORIES]
}

export function updateDiagnosticCategory(
  categories: readonly DiagnosticCategory[] | undefined,
  category: DiagnosticCategory,
  checked: boolean,
) {
  const selected = selectedDiagnosticCategories(categories)
  if (!checked && selected.length === 1) return selected
  return checked ? [...new Set([...selected, category])] : selected.filter((item) => item !== category)
}

export function diagnosticCategoriesPatch(categories: readonly DiagnosticCategory[] | null) {
  return categories === null ? null : [...categories]
}

export function diagnosticCategoriesMatch(
  expected: readonly DiagnosticCategory[] | null,
  actual: readonly DiagnosticCategory[] | undefined,
) {
  if (expected === null) return actual === undefined
  return !!actual && expected.length === actual.length && expected.every((category) => actual.includes(category))
}

export function diagnosticLlmContentMatch(expected: boolean, actual: unknown) {
  return actual === expected
}

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
