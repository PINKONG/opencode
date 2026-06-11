export function resolveDefaultSearchImplementation(input: { disableFff: boolean; fffAvailable: boolean }) {
  if (input.disableFff) return "ripgrep" as const
  return input.fffAvailable ? ("fff" as const) : ("ripgrep" as const)
}
