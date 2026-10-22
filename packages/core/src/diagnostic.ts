import fs from "fs/promises"
import path from "path"
import { Context, Effect, Layer } from "effect"
import { Diagnostic } from "@opencode-ai/schema"
import { FSUtil } from "./fs-util"
import { Global } from "./global"
import { makeGlobalNode } from "./effect/app-node"
import { Flock } from "./util/flock"
import { ConfigDiagnostics } from "./config/diagnostics"

type JsonValue = null | boolean | number | string | JsonValue[] | { [key: string]: JsonValue }
type EventInput = { summary: unknown; raw?: () => unknown | Promise<unknown> }
type EmitOptions = { status?: Diagnostic.Status; durationMs?: number; parentEventId?: string }

export type Category = ConfigDiagnostics.Category
export type ConfigInput = ConfigDiagnostics.Info

export interface Config {
  readonly enabled: boolean
  readonly rawPayloads: boolean
  readonly streaming: boolean
  readonly retentionDays: number
  readonly maxTotalBytes: number
  readonly categories?: readonly Category[]
}

export interface TraceContext {
  readonly sessionId?: string
  readonly traceId?: Diagnostic.TraceID
  readonly parentTraceId?: Diagnostic.TraceID
  readonly followsTraceId?: Diagnostic.TraceID
  readonly turnId?: Diagnostic.TurnID
  readonly toolCallId?: string
  readonly attempt?: number
  readonly runtime?: Diagnostic.Runtime
  readonly location?: Diagnostic.Location
}

export interface Interface {
  readonly configure: (config: Config) => Effect.Effect<void>
  readonly config: () => Config
  readonly startTask: (input: {
    sessionId?: string
    parentTraceId?: string
    followsTraceId?: string
    runtime?: Diagnostic.Runtime
    location?: Diagnostic.Location
  }) => TraceContext
  readonly startTurn: (
    context: TraceContext,
    input?: { attempt?: number },
  ) => TraceContext & {
    readonly turnId: Diagnostic.TurnID
    readonly attempt: number
  }
  readonly emit: (
    context: TraceContext | undefined,
    event: string,
    input: EventInput,
    options?: EmitOptions,
  ) => Effect.Effect<void>
  readonly complete: (
    context: TraceContext | undefined,
    event: string,
    input: EventInput,
    options?: EmitOptions,
  ) => Effect.Effect<void>
  readonly flush: (sessionId?: string) => Effect.Effect<void>
  readonly close: (sessionId?: string) => Effect.Effect<void>
  readonly closeAll: () => Effect.Effect<void>
  readonly root: () => string
  readonly ensureRoot: () => Effect.Effect<void>
  readonly cleanup: () => Effect.Effect<void>
  readonly clear: () => Effect.Effect<{ deleted: number; skipped: number }>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/DiagnosticTrace") {}

const defaults: Config = {
  enabled: false,
  rawPayloads: false,
  streaming: false,
  retentionDays: 14,
  maxTotalBytes: 2 * 1024 * 1024 * 1024,
  categories: undefined,
}

export function fromConfig(input: ConfigInput | undefined): Config {
  return {
    enabled: input?.enabled ?? defaults.enabled,
    rawPayloads: input?.rawPayloads ?? defaults.rawPayloads,
    streaming: input?.streaming ?? defaults.streaming,
    retentionDays: input?.retentionDays ?? defaults.retentionDays,
    maxTotalBytes: input?.maxTotalBytes ?? defaults.maxTotalBytes,
    categories: input?.categories === undefined ? undefined : [...input.categories],
  }
}

type NodeOptions = {
  lowCapacity?: number
  highCapacity?: number
  rotationBytes?: number
  lockTimeoutMs?: number
  lockStaleMs?: number
  cleanupLockTimeoutMs?: number
  cleanupIntervalMs?: number
}

type PendingEvent = {
  priority: "low" | "high"
  ready: Promise<{ envelope: Omit<Diagnostic.Envelope, "seq">; failed?: unknown }>
}

type DropStats = {
  counts: Record<string, number>
  reasons: Record<string, number>
  from: string
  to: string
  timer?: ReturnType<typeof setTimeout>
}

type Stream = {
  queue: PendingEvent[]
  lowCount: number
  highCount: number
  draining?: Promise<void>
  timer?: ReturnType<typeof setTimeout>
}

function makeLayer(options: NodeOptions = {}) {
  return Layer.effect(
    Service,
    Effect.gen(function* () {
      const global = yield* Global.Service
      const filesystem = yield* FSUtil.Service
      let current = fromConfig(defaults)
      let allowed: ReadonlySet<string> | undefined
      const streams = new Map<string, Stream>()
      const background = new Map<string, Promise<void>>()
      const dropped = new Map<string, DropStats>()
      const root = path.join(global.log, "diagnostics")
      const lowCapacity = options.lowCapacity ?? 4096
      const highCapacity = options.highCapacity ?? 256
      const rotationBytes = options.rotationBytes ?? 100 * 1024 * 1024

      const append = async (stream: string, envelope: Omit<Diagnostic.Envelope, "seq">) => {
        const lease = await Flock.acquire(stream, {
          dir: path.join(global.state, "locks"),
          staleMs: options.lockStaleMs ?? 60_000,
          timeoutMs: options.lockTimeoutMs ?? 5 * 60_000,
        })
        try {
          await Effect.runPromise(filesystem.ensureDir(path.dirname(stream)))
          const directory = path.dirname(stream)
          const base = stream.slice(0, -".jsonl".length)
          const prefix = path.basename(base)
          const entries = await fs.readdir(directory)
          const volumes = entries
            .map((name) => ({ name, match: name.match(new RegExp(`^${escapeRegExp(prefix)}(?:\\.(\\d+))?\\.jsonl$`)) }))
            .filter((entry): entry is { name: string; match: RegExpMatchArray } => entry.match !== null)
            .sort((a, b) => Number(a.match[1] ?? 0) - Number(b.match[1] ?? 0))
          let active = volumes.at(-1)?.name ?? path.basename(stream)
          let activePath = path.join(directory, active)
          let stat = await fs.stat(activePath).catch(() => undefined)
          const recovered = stat ? await recoverSequence(activePath, stat.size) : { seq: -1, corrupt: false }
          if (recovered.corrupt) reportFailure("Diagnostic stream has a malformed complete tail", activePath)
          const line = JSON.stringify({ ...envelope, seq: recovered.seq + 1 }) + "\n"
          const byteLength = Buffer.byteLength(line, "utf8")
          if (stat && (recovered.corrupt || (stat.size > 0 && stat.size + byteLength > rotationBytes))) {
            active = `${prefix}.${Number(volumes.at(-1)?.match[1] ?? 0) + 1}.jsonl`
            activePath = path.join(directory, active)
          }
          await fs.writeFile(activePath, line, { flag: "a" })
        } finally {
          await lease.release()
        }
      }

      const reportFailure = (message: string, error: unknown) => {
        void Effect.runPromise(Effect.logError(`${message}: ${String(error)}`))
      }

      const reportContention = (message: string, error: Flock.TimeoutError) => {
        void Effect.runPromise(Effect.logWarning(`${message}: ${error.message}`))
      }

      const flushDrops = (key?: string) => {
        for (const [stream, stats] of dropped) {
          if (key !== undefined && key !== stream) continue
          if (stats.timer) clearTimeout(stats.timer)
          dropped.delete(stream)
          const previous = background.get(stream) ?? Promise.resolve()
          const pending = previous
            .then(() =>
              append(stream, {
                schema: "wiscode.diagnostic",
                schemaVersion: 1,
                eventId: Diagnostic.EventID.create(),
                event: "diagnostic.events_dropped",
                status: "dropped",
                timestamp: stats.to,
                monotonicMs: performance.now(),
                payload: { counts: stats.counts, reasons: stats.reasons, from: stats.from, to: stats.to },
              }),
            )
            .catch((error) => reportFailure("Diagnostic drop record failed", error))
            .finally(() => {
              if (background.get(stream) === pending) background.delete(stream)
            })
          background.set(stream, pending)
        }
      }

      const drop = (event: string, reason: string) => {
        const timestamp = new Date().toISOString()
        const stream = path.join(root, timestamp.slice(0, 10), "instance.jsonl")
        const stats = dropped.get(stream) ?? { counts: {}, reasons: {}, from: timestamp, to: timestamp }
        stats.to = timestamp
        if (stats.counts[event] !== undefined || Object.keys(stats.counts).length < 64)
          stats.counts[event] = (stats.counts[event] ?? 0) + 1
        else stats.counts.other = (stats.counts.other ?? 0) + 1
        stats.reasons[reason] = (stats.reasons[reason] ?? 0) + 1
        dropped.set(stream, stats)
        if (!stats.timer) {
          stats.timer = setTimeout(() => flushDrops(stream), 100)
          stats.timer.unref?.()
        }
      }

      const streamFor = (key: string) => {
        let stream = streams.get(key)
        if (!stream) {
          stream = { queue: [], lowCount: 0, highCount: 0 }
          streams.set(key, stream)
        }
        return stream
      }

      const drain = (key: string, state: Stream): Promise<void> => {
        if (state.draining) return state.draining
        state.draining = (async () => {
          while (state.queue.length) {
            const entry = state.queue[0]
            const result = await entry.ready
            state.queue.shift()
            if (entry.priority === "low") state.lowCount--
            else state.highCount--
            try {
              if (result.failed !== undefined) {
                drop(result.envelope.event, "raw_payload_failed")
                reportFailure("Diagnostic raw payload failed", result.failed)
              } else {
                await append(key, result.envelope)
              }
            } catch (error) {
              reportFailure("Diagnostic trace event failed", error)
            }
          }
        })().finally(() => {
          state.draining = undefined
        })
        return state.draining
      }

      const emit = (context: TraceContext | undefined, event: string, input: EventInput, options: EmitOptions = {}) =>
        Effect.sync(() => {
          const snapshot = current
          if (!snapshot.enabled) return
          if (allowed !== undefined && !allowed.has(event.split(".", 1)[0])) return
          const lowPriority = isLowPriority(event)
          if (isStreamEvent(event) && !snapshot.streaming) return
          const timestamp = new Date().toISOString()
          const key =
            path.join(
              root,
              timestamp.slice(0, 10),
              context?.sessionId ? sessionFilename(context.sessionId) : "instance",
            ) + ".jsonl"
          const state = streamFor(key)
          if (lowPriority && state.lowCount >= lowCapacity) {
            drop(event, "low_priority_capacity")
            return
          }
          if (!lowPriority && state.highCount >= highCapacity) {
            drop(event, "high_priority_capacity")
            return
          }

          const priority = lowPriority ? "low" : "high"
          let summary: JsonValue
          try {
            summary = normalize(input.summary)
          } catch (error) {
            drop(event, "summary_serialization_failed")
            reportFailure("Diagnostic summary serialization failed", error)
            return
          }
          const envelope: Omit<Diagnostic.Envelope, "seq"> = {
            schema: "wiscode.diagnostic",
            schemaVersion: 1,
            eventId: Diagnostic.EventID.create(),
            event,
            status: options.status ?? "started",
            timestamp,
            monotonicMs: performance.now(),
            ...(options.durationMs === undefined ? {} : { durationMs: options.durationMs }),
            ...(context?.sessionId ? { sessionId: context.sessionId } : {}),
            ...(context?.traceId ? { traceId: context.traceId } : {}),
            ...(context?.parentTraceId ? { parentTraceId: context.parentTraceId } : {}),
            ...(context?.followsTraceId ? { followsTraceId: context.followsTraceId } : {}),
            ...(context?.turnId ? { turnId: context.turnId } : {}),
            ...(context?.toolCallId ? { toolCallId: context.toolCallId } : {}),
            ...(options.parentEventId ? { parentEventId: Diagnostic.EventID.make(options.parentEventId) } : {}),
            ...(context?.location ? { location: context.location } : {}),
            ...(context?.runtime ? { runtime: context.runtime } : {}),
            payload: { summary },
          }
          const entry: PendingEvent = {
            priority,
            ready: Promise.resolve().then(async () => {
              if (!input.raw || !snapshot.rawPayloads) return { envelope }
              try {
                return {
                  envelope: { ...envelope, payload: { summary, raw: normalize(await input.raw()) } },
                }
              } catch (failed) {
                return { envelope, failed }
              }
            }),
          }
          state.queue.push(entry)
          if (priority === "low") state.lowCount++
          else state.highCount++

          const immediate =
            options.status === "failed" ||
            options.status === "cancelled" ||
            options.status === "dropped" ||
            options.status === "succeeded"
          if (immediate || state.queue.length >= 64) {
            if (state.timer) clearTimeout(state.timer)
            state.timer = undefined
            void drain(key, state)
          } else if (!state.timer) {
            state.timer = setTimeout(() => {
              state.timer = undefined
              void drain(key, state)
            }, 100)
            state.timer.unref?.()
          }
        }).pipe(Effect.catchCause((cause) => Effect.sync(() => reportFailure("Diagnostic admission failed", cause))))

      const flush = (sessionId?: string) =>
        Effect.promise(async () => {
          const selected = [...streams.entries()].filter(
            ([key]) => sessionId === undefined || key.endsWith(sessionFilename(sessionId) + ".jsonl"),
          )
          await Promise.all(
            selected.map(async ([key, state]) => {
              if (state.timer) clearTimeout(state.timer)
              state.timer = undefined
              await drain(key, state)
            }),
          )
          flushDrops()
          await Promise.all(background.values())
        })

      let cleaning = Promise.resolve()
      const cleanup: Interface["cleanup"] = () =>
        Effect.promise(() => {
          const next = cleaning.then(async () => {
            await Effect.runPromise(flush())
            try {
              const now = Date.now()
              const cutoff =
                current.retentionDays > 0
                  ? new Date(now - current.retentionDays * 24 * 60 * 60 * 1000).toISOString().slice(0, 10)
                  : undefined
              const dates = (await fs.readdir(root, { withFileTypes: true }).catch(() => []))
                .filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))
                .map((entry) => entry.name)
                .sort()
              const candidates: { file: string; stream: string; date: string; mtimeMs: number; size: number }[] = []
              let total = 0
              for (const date of dates) {
                const directory = path.join(root, date)
                const names = await fs.readdir(directory)
                const groups = new Map<string, { name: string; volume: number }[]>()
                for (const name of names) {
                  const match = name.match(/^(instance|ses_.+?)(?:\.(\d+))?\.jsonl$/)
                  if (!match) continue
                  const group = groups.get(match[1]) ?? []
                  group.push({ name, volume: Number(match[2] ?? 0) })
                  groups.set(match[1], group)
                }
                for (const [base, group] of groups) {
                  const active = Math.max(...group.map((item) => item.volume))
                  const stream = path.join(directory, `${base}.jsonl`)
                  for (const item of group) {
                    const file = path.join(directory, item.name)
                    const stat = await fs.stat(file).catch(() => undefined)
                    if (!stat) continue
                    total += stat.size
                    if (item.volume !== active || (cutoff !== undefined && date < cutoff)) {
                      candidates.push({ file, stream, date, mtimeMs: stat.mtimeMs, size: stat.size })
                    }
                  }
                }
              }
              candidates.sort((a, b) => a.date.localeCompare(b.date) || a.mtimeMs - b.mtimeMs)
              for (const candidate of candidates) {
                const expired = cutoff !== undefined && candidate.date < cutoff
                if (!expired && total <= current.maxTotalBytes) continue
                let lease: Awaited<ReturnType<typeof Flock.acquire>> | undefined
                try {
                  lease = await Flock.acquire(candidate.stream, {
                    dir: path.join(global.state, "locks"),
                    staleMs: options.lockStaleMs ?? 60_000,
                    timeoutMs: options.cleanupLockTimeoutMs ?? 250,
                  })
                  const siblings = (await fs.readdir(path.dirname(candidate.stream)))
                    .map((name) =>
                      name.match(
                        new RegExp(
                          `^${escapeRegExp(path.basename(candidate.stream, ".jsonl"))}(?:\\.(\\d+))?\\.jsonl$`,
                        ),
                      ),
                    )
                    .filter((match): match is RegExpMatchArray => match !== null)
                  const active = Math.max(...siblings.map((match) => Number(match[1] ?? 0)))
                  const candidateVolume = Number(candidate.file.match(/\.(\d+)\.jsonl$/)?.[1] ?? 0)
                  if (candidateVolume === active && !expired) continue
                  const stat = await fs.stat(candidate.file).catch(() => undefined)
                  if (!stat) continue
                  await fs.unlink(candidate.file)
                  total -= stat.size
                } catch (error) {
                  if (error instanceof Flock.TimeoutError) {
                    reportContention("Diagnostic cleanup skipped busy stream", error)
                    continue
                  }
                  reportFailure("Diagnostic cleanup failed", error)
                } finally {
                  await lease
                    ?.release()
                    .catch((error) => reportFailure("Diagnostic cleanup lock release failed", error))
                }
              }
              for (const date of dates) {
                await fs.rmdir(path.join(root, date)).catch(() => undefined)
              }
            } catch (error) {
              reportFailure("Diagnostic cleanup failed", error)
            }
          })
          cleaning = next.catch((error) => reportFailure("Diagnostic cleanup failed", error))
          return next
        })

      let cleanupTimer: ReturnType<typeof setTimeout> | undefined
      const scheduleCleanup = () => {
        if (!current.enabled || cleanupTimer) return
        cleanupTimer = setTimeout(() => {
          cleanupTimer = undefined
          if (!current.enabled) return
          void Effect.runPromise(cleanup())
            .catch((error) => reportFailure("Scheduled diagnostic cleanup failed", error))
            .finally(scheduleCleanup)
        }, options.cleanupIntervalMs ?? 6 * 60 * 60 * 1000)
        cleanupTimer.unref?.()
      }
      yield* Effect.addFinalizer(() =>
        Effect.sync(() => {
          if (cleanupTimer) clearTimeout(cleanupTimer)
          cleanupTimer = undefined
        }),
      )

      const clear: Interface["clear"] = () =>
        Effect.promise(() => {
          const next = cleaning.then(async () => {
            await Effect.runPromise(flush())
            let deleted = 0
            let skipped = 0
            const dates = await fs.readdir(root, { withFileTypes: true }).catch((error: NodeJS.ErrnoException) => {
              if (error.code === "ENOENT") return []
              throw error
            })
            for (const date of dates.filter((entry) => entry.isDirectory() && /^\d{4}-\d{2}-\d{2}$/.test(entry.name))) {
              const directory = path.join(root, date.name)
              const names = await fs.readdir(directory)
              const groups = new Map<string, string[]>()
              for (const name of names) {
                const match = name.match(/^(instance|ses_.+?)(?:\.\d+)?\.jsonl$/)
                if (!match) continue
                groups.set(match[1], [...(groups.get(match[1]) ?? []), name])
              }
              for (const [base, files] of groups) {
                let lease: Awaited<ReturnType<typeof Flock.acquire>> | undefined
                let remaining = files.length
                try {
                  lease = await Flock.acquire(path.join(directory, `${base}.jsonl`), {
                    dir: path.join(global.state, "locks"),
                    staleMs: options.lockStaleMs ?? 60_000,
                    timeoutMs: options.cleanupLockTimeoutMs ?? 250,
                  })
                  for (const name of files) {
                    await fs.unlink(path.join(directory, name))
                    deleted++
                    remaining--
                  }
                } catch (error) {
                  skipped += remaining
                  if (error instanceof Flock.TimeoutError) reportContention("Diagnostic clear skipped busy stream", error)
                  else reportFailure("Diagnostic clear failed", error)
                } finally {
                  await lease?.release().catch((error) => reportFailure("Diagnostic clear lock release failed", error))
                }
              }
              await fs.rmdir(directory).catch(() => undefined)
            }
            return { deleted, skipped }
          })
          cleaning = next.then(
            () => undefined,
            (error) => reportFailure("Diagnostic clear failed", error),
          )
          return next
        })

      const startTask: Interface["startTask"] = (input) => ({
        ...(input.sessionId === undefined ? {} : { sessionId: input.sessionId }),
        traceId: Diagnostic.TraceID.create(),
        ...(input.parentTraceId === undefined ? {} : { parentTraceId: Diagnostic.TraceID.make(input.parentTraceId) }),
        ...(input.followsTraceId === undefined
          ? {}
          : { followsTraceId: Diagnostic.TraceID.make(input.followsTraceId) }),
        ...(input.runtime === undefined ? {} : { runtime: input.runtime }),
        ...(input.location === undefined ? {} : { location: input.location }),
      })

      const startTurn: Interface["startTurn"] = (context, input = {}) => ({
        ...context,
        turnId: Diagnostic.TurnID.create(),
        attempt: input.attempt ?? 1,
      })

      return Service.of({
        configure: (value) =>
          Effect.gen(function* () {
            const wasEnabled = current.enabled
            current = fromConfig(value)
            allowed = current.categories === undefined ? undefined : new Set(current.categories)
            if (!current.enabled) {
              if (cleanupTimer) clearTimeout(cleanupTimer)
              cleanupTimer = undefined
              return
            }
            if (!wasEnabled) yield* cleanup().pipe(Effect.forkDetach)
            scheduleCleanup()
          }),
        config: () => current,
        startTask,
        startTurn,
        emit,
        complete: (context, event, input, options = {}) =>
          emit(context, event, input, { ...options, status: options.status ?? "succeeded" }),
        flush,
        close: flush,
        closeAll: () => flush(),
        root: () => root,
        ensureRoot: () => filesystem.ensureDir(root).pipe(Effect.orDie),
        cleanup,
        clear,
      })
    }),
  )
}

export const node = makeGlobalNode({ service: Service, layer: makeLayer(), deps: [Global.node, FSUtil.node] })
export const testingNode = (options: NodeOptions) =>
  makeGlobalNode({ service: Service, layer: makeLayer(options), deps: [Global.node, FSUtil.node] })

export function errorInfo(error: unknown, stage: string) {
  const source = error !== null && typeof error === "object" ? (error as Record<string, unknown>) : undefined
  return {
    name: typeof source?.name === "string" ? source.name : "Error",
    message: typeof source?.message === "string" ? source.message : String(error),
    ...(typeof source?.stack === "string" ? { stack: source.stack } : {}),
    retryable: source?.retryable === true,
    stage,
    ...(source?.providerError === undefined ? {} : { providerError: source.providerError }),
  }
}

function isLowPriority(event: string) {
  return isStreamEvent(event) || event.startsWith("processing.phase.")
}

function isStreamEvent(event: string) {
  return /\.(chunk|delta|progress|token)$/.test(event)
}

async function recoverSequence(file: string, size: number): Promise<{ seq: number; corrupt: boolean }> {
  if (size === 0) return { seq: -1, corrupt: false }
  const handle = await fs.open(file, "r+")
  try {
    let window = Math.min(size, 64 * 1024)
    let tail: Buffer
    let start: number
    let lastNewline: number
    while (true) {
      start = size - window
      tail = Buffer.alloc(window)
      await handle.read(tail, 0, window, start)
      lastNewline = tail.lastIndexOf(10)
      const lines = tail.subarray(0, Math.max(0, lastNewline)).toString("utf8").split("\n")
      const candidates = start === 0 ? lines : lines.slice(1)
      const valid = candidates.findLast((line) => {
        if (!line) return false
        try {
          const parsed = JSON.parse(line) as { seq?: unknown }
          return typeof parsed.seq === "number" && Number.isInteger(parsed.seq) && parsed.seq >= 0
        } catch {
          return false
        }
      })
      if (valid || start === 0) {
        if (lastNewline < tail.length - 1) await handle.truncate(Math.max(0, start + lastNewline + 1))
        const last = lines.at(-1)
        return {
          seq: valid ? (JSON.parse(valid) as { seq: number }).seq : -1,
          corrupt: Boolean(last && last !== valid),
        }
      }
      window = Math.min(size, window * 2)
    }
  } finally {
    await handle.close()
  }
}

function normalize(value: unknown, seen = new WeakSet<object>()): JsonValue {
  if (value === null || typeof value === "string" || typeof value === "boolean") return value
  if (typeof value === "number") return Number.isFinite(value) ? value : { type: "number", value: String(value) }
  if (value === undefined) return { type: "undefined" }
  if (value instanceof Error)
    return { name: value.name, message: value.message, ...(value.stack ? { stack: value.stack } : {}) }
  if (typeof value === "bigint") return { type: "bigint", value: value.toString() }
  if (typeof value === "symbol") return { type: "symbol", value: value.description ?? "" }
  if (typeof value === "function") return { type: "function", name: value.name }
  if (value instanceof Uint8Array) return { type: "binary", bytes: value.byteLength }
  if (typeof value !== "object") return { type: typeof value, value: String(value) }
  if (seen.has(value)) return { type: "circular" }
  seen.add(value)
  try {
    if (Array.isArray(value)) return value.map((item) => normalize(item, seen))
    if (Object.getPrototypeOf(value) !== Object.prototype && Object.getPrototypeOf(value) !== null) {
      return { type: value.constructor?.name ?? "object", value: String(value) }
    }
    return Object.fromEntries(
      Object.entries(value)
        .filter(([, item]) => item !== undefined)
        .map(([key, item]) => [key, normalize(item, seen)]),
    )
  } finally {
    seen.delete(value)
  }
}

function escapeRegExp(value: string) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
}

export function sessionFilename(sessionId: string) {
  return `ses_${encodeURIComponent((sessionId.startsWith("ses_") ? sessionId.slice(4) : sessionId).toWellFormed())}`
}

export * as DiagnosticTrace from "./diagnostic"
