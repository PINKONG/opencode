import { Schema } from "effect"
import { descending } from "./identifier"
import { NonNegativeInt, optional, statics } from "./schema"

export const Status = Schema.Literals(["started", "succeeded", "failed", "cancelled", "dropped"])
export type Status = typeof Status.Type

export const Surface = Schema.Literals(["cli", "web", "desktop", "acp", "background"])
export type Surface = typeof Surface.Type

export const SessionEngine = Schema.Literals(["legacy-v1", "session-v2"])
export type SessionEngine = typeof SessionEngine.Type

export const QuerySource = Schema.Literals(["main", "subagent", "title", "summary", "compaction", "auxiliary"])
export type QuerySource = typeof QuerySource.Type

export const Phase = Schema.String
export type Phase = typeof Phase.Type

const NonNegativeNumber = Schema.Number.check(Schema.isGreaterThanOrEqualTo(0))

export const EventID = Schema.String.pipe(
  Schema.brand("DiagnosticEventID"),
  statics((schema) => ({ create: () => schema.make("evt_" + descending()) })),
)
export type EventID = typeof EventID.Type

export const TraceID = Schema.String.pipe(
  Schema.brand("DiagnosticTraceID"),
  statics((schema) => ({ create: () => schema.make("trace_" + descending()) })),
)
export type TraceID = typeof TraceID.Type

export const TurnID = Schema.String.pipe(
  Schema.brand("DiagnosticTurnID"),
  statics((schema) => ({ create: () => schema.make("turn_" + descending()) })),
)
export type TurnID = typeof TurnID.Type

export const Location = Schema.Struct({
  directory: Schema.String,
  workspaceID: optional(Schema.String),
})
export type Location = typeof Location.Type

export const Runtime = Schema.Struct({
  version: optional(Schema.String),
  pid: optional(NonNegativeInt),
  surface: optional(Surface),
  sessionEngine: optional(SessionEngine),
})
export type Runtime = typeof Runtime.Type

export const Cost = Schema.Struct({
  amount: Schema.Number,
  currency: Schema.String,
  estimated: Schema.Boolean,
})
export type Cost = typeof Cost.Type

export const Usage = Schema.Struct({
  inputTokens: optional(Schema.Number),
  outputTokens: optional(Schema.Number),
  nonCachedInputTokens: optional(Schema.Number),
  cacheReadInputTokens: optional(Schema.Number),
  cacheWriteInputTokens: optional(Schema.Number),
  reasoningTokens: optional(Schema.Number),
  totalTokens: optional(Schema.Number),
  providerMetadata: optional(Schema.Record(Schema.String, Schema.Record(Schema.String, Schema.Json))),
  cost: optional(Cost),
})
export type Usage = typeof Usage.Type

export const ErrorInfo = Schema.Struct({
  name: Schema.String,
  message: Schema.String,
  stack: optional(Schema.String),
  retryable: Schema.Boolean,
  stage: optional(Schema.String),
  providerError: optional(Schema.Json),
})
export type ErrorInfo = typeof ErrorInfo.Type

export const Envelope = Schema.Struct({
  schema: Schema.Literal("wiscode.diagnostic"),
  schemaVersion: Schema.Literal(1),
  seq: NonNegativeInt,
  eventId: EventID,
  event: Schema.String,
  status: Status,
  timestamp: Schema.String,
  monotonicMs: NonNegativeNumber,
  durationMs: optional(NonNegativeNumber),
  sessionId: optional(Schema.String),
  traceId: optional(TraceID),
  parentTraceId: optional(TraceID),
  followsTraceId: optional(TraceID),
  turnId: optional(TurnID),
  toolCallId: optional(Schema.String),
  parentEventId: optional(EventID),
  location: optional(Location),
  runtime: optional(Runtime),
  payload: Schema.Json,
})
export type Envelope = typeof Envelope.Type
