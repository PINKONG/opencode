import fs from "node:fs/promises"
import { createReadStream } from "node:fs"
import path from "node:path"
import { Diagnostic } from "@opencode-ai/schema"
import { Schema } from "effect"
import { sessionFilename } from "./diagnostic"

export namespace DiagnosticReader {
  export type Scope = {
    session?: string
    trace?: string
    since?: string
    until?: string
    event?: string
    status?: Diagnostic.Status
    chunks?: boolean
    limit: number
    onProgress?: (files: number, bytes: number) => void | Promise<void>
  }

  export type Row = Omit<Diagnostic.Envelope, "payload"> & {
    summary: Record<string, unknown>
    source: string
    offset: number
  }

  export type Result = { rows: Row[]; exists: boolean; warnings: string[]; scannedFiles: number; scannedBytes: number; cursors: Map<string, Cursor>; traceIds: Set<string> }
  export type Cursor = { dev: number; ino: number; birthtimeMs: number; offset: number; size: number; ctimeMs: number }

  type File = { name: string; full: string; date: string; volume: number; base: string }
  const decode = Schema.decodeUnknownSync(Diagnostic.Envelope)
  const maxLineBytes = 64 * 1024 * 1024

  export async function discover(root: string): Promise<File[]> {
    const days = await fs.readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return []
      throw error
    })
    const files = await Promise.all(days.filter((day) => day.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(day.name)).map(async (day) => {
      const dir = path.join(root, day.name)
      return (await fs.readdir(dir, { withFileTypes: true })).flatMap((entry) => {
        if (!entry.isFile()) return []
        const match = entry.name.match(/^(instance|ses_.+?)(?:\.(\d+))?\.jsonl$/)
        if (!match) return []
        return [{ name: entry.name, full: path.join(dir, entry.name), date: day.name, base: match[1], volume: Number(match[2] ?? 0) }]
      })
    }))
    return files.flat().sort((a, b) => a.date.localeCompare(b.date) || a.base.localeCompare(b.base) || a.volume - b.volume)
  }

  export async function scan(file: string, visit: (value: Diagnostic.Envelope, offset: number) => void | Promise<void>, from = 0) {
    let pending = Buffer.alloc(0)
    let offset = from
    let line = 0
    const stream = createReadStream(file, { start: from })
    for await (const chunk of stream) {
      const data = Buffer.concat([pending, chunk])
      let start = 0
      for (let end = data.indexOf(10, start); end !== -1; end = data.indexOf(10, start)) {
        line++
        const bytes = data.subarray(start, end)
        if (bytes.length > maxLineBytes) throw new Error(`${file}:${line}: diagnostic record exceeds 64 MiB`)
        let event: Diagnostic.Envelope
        try {
          event = decode(JSON.parse(bytes.toString("utf8")))
        } catch (error) {
          throw new Error(`${file}:${line}: invalid diagnostic record: ${String(error)}`)
        }
        await visit(event, offset + start)
        start = end + 1
      }
      offset += start
      pending = data.subarray(start)
      if (pending.length > maxLineBytes) throw new Error(`${file}:${line + 1}: diagnostic record exceeds 64 MiB`)
    }
    return offset
  }

  export async function poll(root: string, previous: Map<string, Cursor>, visit: (row: Row) => void | Promise<void>) {
    const cursors = new Map<string, Cursor>()
    const resets: string[] = []
    for (const file of await discover(root)) {
      const stat = await fs.stat(file.full).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (!stat) continue
      const prior = previous.get(file.full)
      const same = prior && prior.dev === stat.dev && prior.ino === stat.ino && prior.birthtimeMs === stat.birthtimeMs
      const reset = prior && (!same || stat.size < prior.offset || stat.size === prior.size && stat.ctimeMs !== prior.ctimeMs)
      const from = prior && !reset ? prior.offset : 0
      if (reset) resets.push(file.full)
      const offset = await scan(file.full, (event, position) => visit(project(event, file.full, position)), from).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (offset === undefined) continue
      cursors.set(file.full, { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, offset, size: stat.size, ctimeMs: stat.ctimeMs })
    }
    return { cursors, resets }
  }

  export function matches(row: Row, scope: Scope, traces: Set<string>) {
    if (scope.session && row.sessionId !== scope.session) return false
    if (scope.trace && (!row.traceId || !traces.has(row.traceId))) return false
    if (scope.since && row.timestamp < scope.since) return false
    if (scope.until && row.timestamp > scope.until) return false
    if (scope.status && row.status !== scope.status) return false
    if (!scope.chunks && row.event === "llm.stream.chunk") return false
    if (scope.event && !glob(scope.event, row.event)) return false
    return true
  }

  export async function backfill(root: string, traces: Set<string>, visit: (row: Row) => void | Promise<void>) {
    for (const file of await discover(root)) await scan(file.full, (event, offset) => {
      if (!event.traceId || !traces.has(event.traceId)) return
      return visit(project(event, file.full, offset))
    }).catch((error: NodeJS.ErrnoException) => {
      if (error.code === "ENOENT") return
      throw error
    })
  }

  export async function find(root: string, eventId: string) {
    let found: { event: Diagnostic.Envelope; source: string } | undefined
    for (const file of await discover(root)) await scan(file.full, (event) => {
      if (event.eventId !== eventId) return
      if (found) throw new Error(`duplicate diagnostic event ID: ${eventId}`)
      found = { event, source: file.full }
    })
    return found
  }

  export async function snapshot(root: string, scope: Scope): Promise<Result> {
    if (scope.session && scope.trace) throw new Error("session and trace scopes are mutually exclusive")
    if (!Number.isSafeInteger(scope.limit) || scope.limit < 1 || scope.limit > 10_000) throw new Error("limit must be 1..10000")
    const files = (await discover(root)).filter((file) => !scope.session || file.base === sessionFilename(scope.session))
    const linked = new Map<string, Set<string>>()
    const present = new Set<string>()
    const warnings: string[] = []
    let scannedFiles = 0
    let scannedBytes = 0
    if (scope.trace) for (const file of files) {
      const bytes = await scan(file.full, (event) => {
      if (event.traceId) present.add(event.traceId)
      const parent = event.parentTraceId
      const child = event.traceId
      if (parent && child && child !== parent) linked.set(parent, (linked.get(parent) ?? new Set()).add(child))
      if (event.event !== "task.child.started" || !parent && !child) return
      const summary = (event.payload as { summary?: { childTraceId?: unknown } }).summary
      if (typeof summary?.childTraceId !== "string") return
      const source = child ?? parent
      if (source) linked.set(source, (linked.get(source) ?? new Set()).add(summary.childTraceId))
      }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          if (!warnings.length) warnings.push("A diagnostic file disappeared during scanning; this snapshot is partial.")
          return undefined
        }
        throw error
      })
      if (bytes === undefined) continue
      scannedBytes += bytes
      scannedFiles++
      await scope.onProgress?.(scannedFiles, scannedBytes)
    }
    const traces = new Set(scope.trace ? [scope.trace] : [])
    const waiting = [...traces]
    for (const trace of waiting) for (const child of linked.get(trace) ?? []) {
      if (traces.has(child)) continue
      traces.add(child)
      waiting.push(child)
    }

    const rows: Row[] = []
    const cursors = new Map<string, Cursor>()
    let exists = !scope.session && !scope.trace
    for (const file of files) {
      const stat = await fs.stat(file.full).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") return undefined
        throw error
      })
      if (!stat) {
        if (!warnings.length) warnings.push("A diagnostic file disappeared during scanning; this snapshot is partial.")
        continue
      }
      const offset = await scan(file.full, (event, offset) => {
        if (scope.session && event.sessionId !== scope.session) return
        if (scope.trace && (!event.traceId || !traces.has(event.traceId))) return
        exists = true
        if (scope.since && event.timestamp < scope.since) return
        if (scope.until && event.timestamp > scope.until) return
        if (scope.status && event.status !== scope.status) return
        if (!scope.chunks && event.event === "llm.stream.chunk") return
        if (scope.event && !glob(scope.event, event.event)) return
        const row = project(event, file.full, offset)
        if (rows.length === scope.limit && compare(row, rows[0], !!scope.session) <= 0) return
        let low = 0
        let high = rows.length
        while (low < high) {
          const middle = (low + high) >>> 1
          if (compare(rows[middle], row, !!scope.session) <= 0) low = middle + 1
          else high = middle
        }
        rows.splice(low, 0, row)
        if (rows.length > scope.limit) rows.shift()
      }).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
          if (!warnings.length) warnings.push("A diagnostic file disappeared during scanning; this snapshot is partial.")
          return undefined
        }
        throw error
      })
      if (offset === undefined) continue
      scannedBytes += offset
      scannedFiles++
      await scope.onProgress?.(scannedFiles, scannedBytes)
      cursors.set(file.full, { dev: stat.dev, ino: stat.ino, birthtimeMs: stat.birthtimeMs, offset, size: stat.size, ctimeMs: stat.ctimeMs })
    }
    if (scope.trace) warnings.push(...[...traces].filter((trace) => !present.has(trace)).map((trace) => `Trace ${trace} has no retained records; the chain is partial.`))
    return { rows, exists: scope.trace ? [...traces].some((trace) => present.has(trace)) : exists, warnings, scannedFiles, scannedBytes, cursors, traceIds: traces }
  }

  function project(event: Diagnostic.Envelope, source: string, offset: number): Row {
    const payload = event.payload as { summary?: unknown }
    const budget = { remaining: 2048 }
    const summary = compact(payload.summary, budget, 0)
    const { payload: _raw, ...envelope } = event
    return { ...envelope, summary: summary && typeof summary === "object" && !Array.isArray(summary) ? summary as Record<string, unknown> : {}, source, offset }
  }

  function compact(value: unknown, budget: { remaining: number }, depth: number): unknown {
    if (budget.remaining <= 0) return undefined
    if (typeof value === "string") {
      const result = value.slice(0, Math.min(256, budget.remaining))
      budget.remaining -= result.length
      return result
    }
    if (typeof value === "number" || typeof value === "boolean") {
      budget.remaining -= String(value).length
      return value
    }
    if (!value || typeof value !== "object" || depth >= 3) return undefined
    if (Array.isArray(value)) return value.slice(0, 4).flatMap((item) => {
      const result = compact(item, budget, depth + 1)
      return result === undefined ? [] : [result]
    })
    return Object.fromEntries(Object.entries(value).slice(0, depth === 0 ? 24 : 8).flatMap(([key, item]) => {
      if (budget.remaining <= 0) return []
      const name = key.slice(0, 48)
      budget.remaining -= name.length + 4
      const result = compact(item, budget, depth + 1)
      return result === undefined ? [] : [[name, result]]
    }))
  }

  function compare(a: Row, b: Row, session: boolean) {
    if (!session) return a.timestamp.localeCompare(b.timestamp) || a.source.localeCompare(b.source) || a.seq - b.seq || a.eventId.localeCompare(b.eventId)
    const day = path.basename(path.dirname(a.source)).localeCompare(path.basename(path.dirname(b.source)))
    if (day) return day
    const volume = (a.source.match(/\.(\d+)\.jsonl$/)?.[1] ?? "0")
    const other = (b.source.match(/\.(\d+)\.jsonl$/)?.[1] ?? "0")
    return Number(volume) - Number(other) || a.seq - b.seq
  }

  function glob(pattern: string, name: string) {
    return new RegExp(`^${pattern.split("*").map((part) => part.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join(".*")}$`).test(name)
  }
}
