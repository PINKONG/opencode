function aborted(error: unknown) {
  return error instanceof Error && error.name === "AbortError"
}

export async function safeSessionSync<T>(run: () => Promise<T>, onError?: (error: unknown) => void) {
  try {
    return await run()
  } catch (error) {
    if (!aborted(error)) onError?.(error)
  }
}
