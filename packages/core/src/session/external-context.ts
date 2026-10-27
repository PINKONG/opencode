export const MAX_BYTES = 256 * 1024
export const MAX_DEPTH = 20
export const MAX_KEYS = 10_000
export const MAX_ARRAY_LENGTH = 10_000

export type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }

export interface Snapshot {
  readonly source: string
  readonly revision: number
  readonly data: Record<string, JsonValue>
}

export function validateData(value: unknown): Record<string, JsonValue> {
  const counts = { depth: 0, keys: 0 }
  const result = visit(value, counts, 0)
  if (!result || Array.isArray(result) || typeof result !== "object") throw new Error("External context must be an object")
  const encoded = JSON.stringify(result)
  if (new TextEncoder().encode(encoded).byteLength > MAX_BYTES) throw new Error("External context is too large")
  return result as Record<string, JsonValue>
}

export function render(snapshot: Snapshot | undefined) {
  if (!snapshot || Object.keys(snapshot.data).length === 0) return ""
  const json = JSON.stringify(snapshot.data).replaceAll("<", "\\u003c")
  return [
    `<wiscode_external_context source="${escapeAttribute(snapshot.source)}" revision="${snapshot.revision}" trust="external-data">`,
    json,
    "</wiscode_external_context>",
  ].join("\n")
}

function visit(value: unknown, counts: { depth: number; keys: number }, depth: number): JsonValue {
  if (depth > MAX_DEPTH) throw new Error("External context is too deeply nested")
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") {
    if (!Number.isFinite(value)) throw new Error("External context contains a non-finite number")
    return value
  }
  if (Array.isArray(value)) {
    if (value.length > MAX_ARRAY_LENGTH) throw new Error("External context array is too large")
    return value.map((item) => visit(item, counts, depth + 1))
  }
  if (typeof value !== "object") throw new Error("External context contains a non-JSON value")
  const prototype = Object.getPrototypeOf(value)
  if (prototype !== Object.prototype && prototype !== null) throw new Error("External context contains a non-JSON value")
  const output: Record<string, JsonValue> = {}
  for (const [key, item] of Object.entries(value)) {
    counts.keys += 1
    if (counts.keys > MAX_KEYS) throw new Error("External context has too many keys")
    Object.defineProperty(output, key, {
      value: visit(item, counts, depth + 1),
      enumerable: true,
      configurable: true,
      writable: true,
    })
  }
  return output
}

function escapeAttribute(value: string) {
  return value.replaceAll("&", "&amp;").replaceAll('"', "&quot;").replaceAll("<", "&lt;")
}

export const SessionExternalContext = {
  validateData,
  render,
}
