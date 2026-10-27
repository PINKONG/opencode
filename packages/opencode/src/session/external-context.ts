import { Database } from "@opencode-ai/core/database/database"
import { SessionExternalContext, type JsonValue } from "@opencode-ai/core/session/external-context"
import { SessionExternalContextTable } from "@opencode-ai/core/session/sql"
import { DiagnosticTrace } from "@opencode-ai/core/diagnostic"
import { Effect, Context, Layer } from "effect"
import { LayerNode } from "@opencode-ai/core/effect/layer-node"
import { createHash } from "node:crypto"
import { eq } from "drizzle-orm"
import { SessionID } from "./schema"

export type Snapshot = {
  source: string
  revision: number
  data: Record<string, JsonValue>
}

export type PutInput = {
  sessionID: SessionID
  source: string
  instanceId: string
  contextVersion: number
  requestId: string
  expectedRevision: number
  data: unknown
}

export class ConflictError extends Error {
  readonly _tag = "ExternalContextConflictError"
}

export class RequestIdError extends Error {
  readonly _tag = "ExternalContextRequestIdError"
}

export interface Interface {
  readonly get: (sessionID: SessionID) => Effect.Effect<Snapshot | undefined>
  readonly put: (input: PutInput) => Effect.Effect<Snapshot, ConflictError | RequestIdError>
  readonly remove: (sessionID: SessionID) => Effect.Effect<void>
  readonly render: (sessionID: SessionID) => Effect.Effect<string>
}

export class Service extends Context.Service<Service, Interface>()("@opencode/SessionExternalContext") {}

const layer = Layer.effect(
  Service,
  Effect.gen(function* () {
    const { db } = yield* Database.Service
    const diagnostics = yield* DiagnosticTrace.Service

    const get = Effect.fn("ExternalContext.get")(function* (sessionID: SessionID) {
      const row = yield* db.select().from(SessionExternalContextTable).where(eq(SessionExternalContextTable.session_id, sessionID)).get().pipe(Effect.orDie)
      if (!row) return undefined
      const data = yield* Effect.try({
        try: () => SessionExternalContext.validateData(row.value),
        catch: (error) => error,
      }).pipe(Effect.orDie)
      return { source: row.source, revision: row.revision, data }
    })

    const put = Effect.fn("ExternalContext.put")(function* (input: PutInput) {
      const data = yield* Effect.try({ try: () => SessionExternalContext.validateData(input.data), catch: (error) => new ConflictError(String(error)) })
      const requestHash = hash({
        source: input.source,
        instanceId: input.instanceId,
        contextVersion: input.contextVersion,
        expectedRevision: input.expectedRevision,
        data,
      })
      const result = yield* db.transaction((tx) =>
        Effect.gen(function* () {
          const current = yield* tx
            .select()
            .from(SessionExternalContextTable)
            .where(eq(SessionExternalContextTable.session_id, input.sessionID))
            .get()
            .pipe(Effect.orDie)
          if (current?.last_request_id === input.requestId) {
            if (current.last_request_hash !== requestHash) return yield* Effect.fail(new RequestIdError("requestId was reused"))
            const data = yield* Effect.try({
              try: () => SessionExternalContext.validateData(current.value),
              catch: (error) => error,
            }).pipe(Effect.orDie)
            return { source: current.source, revision: current.revision, data }
          }
          if ((current?.revision ?? 0) !== input.expectedRevision) return yield* Effect.fail(new ConflictError("stale revision"))
          if (current && current.last_instance_id === input.instanceId && (current.last_context_version ?? 0) >= input.contextVersion)
            return yield* Effect.fail(new ConflictError("stale context version"))
          const revision = (current?.revision ?? 0) + 1
          const value = {
            session_id: input.sessionID,
            source: input.source,
            revision,
            value: data,
            last_instance_id: input.instanceId,
            last_context_version: input.contextVersion,
            last_request_id: input.requestId,
            last_request_hash: requestHash,
            last_request_result: { source: input.source, revision },
            time_updated: Date.now(),
          }
          if (current) yield* tx.update(SessionExternalContextTable).set(value).where(eq(SessionExternalContextTable.session_id, input.sessionID)).run().pipe(Effect.orDie)
          else yield* tx.insert(SessionExternalContextTable).values(value).run().pipe(Effect.orDie)
          return { source: input.source, revision, data }
        }),
      ).pipe(Effect.catchTag("SqlError", Effect.die))
      yield* diagnostics.emit(
        { sessionId: input.sessionID },
        "context.external.updated",
        {
          summary: {
            source: input.source,
            revision: result.revision,
            dataBytes: Buffer.byteLength(JSON.stringify(result.data), "utf8"),
            result: "saved",
          },
        },
      )
      return result
    })

    const remove = Effect.fn("ExternalContext.remove")(function* (sessionID: SessionID) {
      yield* db.delete(SessionExternalContextTable).where(eq(SessionExternalContextTable.session_id, sessionID)).run().pipe(Effect.orDie)
      yield* diagnostics.emit({ sessionId: sessionID }, "context.external.removed", {
        summary: { result: "removed" },
      })
    })

    const render = Effect.fn("ExternalContext.render")(function* (sessionID: SessionID) {
      const snapshot = yield* get(sessionID)
      return SessionExternalContext.render(snapshot)
    })

    return Service.of({ get, put, remove, render })
  }),
)

function hash(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value, (_, item) => (item && typeof item === "object" && !Array.isArray(item) ? Object.fromEntries(Object.entries(item).sort()) : item))).digest("hex")
}

export const node = LayerNode.make({ service: Service, layer, deps: [Database.node, DiagnosticTrace.node] })

export * as ExternalContext from "./external-context"
