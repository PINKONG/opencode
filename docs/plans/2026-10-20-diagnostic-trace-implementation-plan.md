# Diagnostic Trace Foundation Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Deliver the first implementation slice of WisCode diagnostic tracing: a versioned event contract, resilient JSONL storage, and a Core `DiagnosticTrace` service that can later be connected to Legacy `SessionPrompt` and the global settings API.

**Architecture:** Keep the durable event contract in `@opencode-ai/schema`. Keep filesystem ownership, queueing, routing, rotation, retention, and explicit trace contexts in a global Core service. The service is disabled by default, never uses ambient context, never blocks business code on disk flush, and accepts configuration through an explicit API so the later global settings integration does not depend on location-scoped `Config.Service`.

**Tech Stack:** Effect `Context.Service`/`Layer`, `@effect/platform` filesystem primitives through `FSUtil`, Bun tests, JSONL files under `Global.Path.log/diagnostics`, and the existing `Flock` utility for cross-process stream coordination.

**Reference design:** `docs/plans/2026-10-20-diagnostic-trace-design.md`

**Scope boundary:** This plan implements the first foundation slice from design §11 steps 1 and 2: schema/envelope, JSONL writer, and the Core `DiagnosticTrace` service. It does not connect `SessionPrompt`, AI SDK fetch recording, tools, skills, plugins, MCP, knowledge adapters, settings UI/API, CLI/Web/Desktop surfaces, OpenTelemetry, or the future `SessionRunner` path. Those integrations must be planned and tested after this foundation lands.

## Task 1: Add the Shared Diagnostic Contract

**Files:**
- Create: `packages/schema/src/diagnostic.ts`
- Modify: `packages/schema/src/index.ts`
- Create: `packages/schema/test/diagnostic.test.ts`

**Step 1: Write the failing contract tests**

Add tests for:

- A minimal envelope with only required fields decodes successfully.
- Optional association fields (`sessionId`, `traceId`, `parentTraceId`, `followsTraceId`, `turnId`, `toolCallId`, `parentEventId`, and `durationMs`) may be omitted.
- `status` accepts `started`, `succeeded`, `failed`, `cancelled`, and `dropped` only.
- `querySource` accepts `main`, `subagent`, `title`, `summary`, `compaction`, and `auxiliary`; it does not accept `retry`.
- `runtime.sessionEngine` distinguishes `legacy-v1` and `session-v2`, while `phase` and event names remain forward-compatible strings.
- Unknown payload fields survive a decode/encode round trip.
- A payload can be an arbitrary JSON-compatible value, including nested records and arrays.

Run from the package directory:

```bash
cd packages/schema
bun test test/diagnostic.test.ts
```

Expected: FAIL because `@opencode-ai/schema/diagnostic` and its exports do not exist yet.

**Step 2: Define the contract**

Implement a `Diagnostic` namespace matching the design document:

- `Envelope` with `schema: "wiscode.diagnostic"`, `schemaVersion: 1`, non-negative integer `seq`, event ID, event name, status, UTC timestamp, monotonic milliseconds, optional duration and association keys, optional location/runtime objects, and `payload`.
- `Status`, `Surface`, `SessionEngine`, `QuerySource`, and the stable ID brands or constructors needed by the Core service.
- `Usage` with the existing LLM token fields plus optional cost/currency/estimated fields and provider metadata. Reuse the same token meaning as `@opencode-ai/llm`; do not introduce a second token vocabulary.
- Keep Schema's runtime dependencies independent of Core and LLM. Mirror the existing usage field semantics in this contract without importing an LLM runtime module into Schema.
- `ErrorInfo` with name/message, optional stack, retryability, stage, and provider error payload.
- Optional fields must be omitted on encode when undefined, not emitted as null placeholders.
- Keep event and phase strings open for forward-compatible additions. Do not make the schema reject a future event name.

Use the repository's `optional` and `statics` schema helpers where appropriate. `timestamp` is an ISO 8601 string as specified by the envelope, not `DateTimeUtcFromMillis` (which encodes milliseconds). The contract must remain serializable as JSONL; binary and non-JSON values are normalized by the Core writer, not accepted as an excuse to weaken the envelope.

**Step 3: Export and verify the contract**

Export the namespace from `packages/schema/src/index.ts`, then run:

```bash
cd packages/schema
bun test test/diagnostic.test.ts
bun typecheck
```

Expected: all diagnostic tests pass and schema typecheck passes.

**Step 4: Commit the isolated contract change**

```bash
git add packages/schema/src/diagnostic.ts packages/schema/src/index.ts packages/schema/test/diagnostic.test.ts
git commit -m "feat(schema): add diagnostic trace contract"
```

## Task 2: Define the Core Diagnostic Service Boundary

**Files:**
- Create: `packages/core/src/diagnostic.ts`
- Create: `packages/core/test/diagnostic.test.ts`

**Step 1: Write service API tests**

Build a test layer with `AppNodeBuilder`, `DiagnosticTrace.node`, `Global.node`, and `FSUtil.node`, replacing both `log` and `state` with paths under a temporary directory via `Global.layerWith`. Overriding only `data` does not change `Global.Path.log`. Test the service through its public interface, not private writer functions.

Cover these initial behaviors:

- The default configuration is disabled and `emit` performs no filesystem write.
- Explicit `configure({ enabled: true, rawPayloads: false, streaming: false, retentionDays: 14, maxTotalBytes: 2 * 1024 * 1024 * 1024 })` enables writes.
- `startTask` returns an explicit trace context containing a generated `traceId`; it does not mutate a process-global current trace.
- A second task/session can be started while the first is active and retains independent context.
- `startTurn` creates a distinct turn ID linked to its trace/session, and `complete` preserves the association keys.
- `emit` accepts an explicitly supplied context and never reads `AsyncLocalStorage` or another implicit context.
- `emit` receives a summary and an optional lazy raw supplier; when `rawPayloads: false` or diagnostics are disabled, the supplier is never invoked and only the summary can reach the writer.
- When `rawPayloads: true`, reserve bounded queue capacity before invoking the supplier exactly once under that event's configuration snapshot; accept either a value or a Promise so transport adapters can read cloned response bodies asynchronously. A rejected/evicted reservation must not invoke the supplier. Queue the resolved payload, never an unbounded pending supplier; release the reservation on resolution or failure and isolate synchronous throws or Promise rejections as dropped diagnostic events without failing business code.
- Test the supplier contract explicitly: disabled/raw-off paths do not call it; raw-on calls it once; a rejected Promise is counted as a dropped diagnostic event and does not reject `emit` or `complete`.
- `close` flushes the selected stream without affecting another active session.
- `configure({ enabled: false })` stops new writes but does not delete existing diagnostic files.

Run from the package directory:

```bash
cd packages/core
bun test test/diagnostic.test.ts
```

Expected: FAIL because the service and node do not exist.

**Step 2: Implement the public service shape**

Expose `DiagnosticTrace` as a global `Context.Service` with a global `LayerNode`:

- `configure(input)` and `config()` for explicit runtime configuration. Configuration changes are in-memory in this task; the settings/API adapter belongs to a later task.
- `configure()` must be serialized with event admission. Each admitted event snapshots `enabled`, `rawPayloads`, and `streaming`; an event accepted before disable remains queued and drains, while events submitted after disable are rejected without creating files. Enabling does not retroactively capture prior events.
- `startTask(input)` returning a task/trace context with `sessionId`, `traceId`, optional `parentTraceId`, optional `followsTraceId`, and `runtime` metadata.
- `startTurn(context, input)` returning a turn context with `turnId` and `attempt`.
- `emit(context, event, { summary, raw?: () => Payload | Promise<Payload> }, options?)` for instantaneous or started events.
- `complete(context, event, { summary, raw?: () => Payload | Promise<Payload> }, options?)` for terminal events and immediate flush priority.
- `flush(sessionId?)`, `close(sessionId?)`, and `closeAll()`.
- A diagnostic root/path accessor for later “open logs directory” API work.
- An explicit `cleanup()` operation for retention and the later settings “立即清理” action.

The API must accept contexts as values passed by callers. Do not store a mutable `currentTrace`, use an ambient singleton, or use `AsyncLocalStorage`. Keep ID generation, timestamp creation, and runtime metadata inside the service so future Legacy and SessionRunner adapters share one envelope implementation.

**Step 3: Implement the minimal disabled behavior**

Add the service and global node with disabled-by-default state. Make all public methods safe to call when disabled. Return generated contexts even when disabled so a later dynamic enable does not change caller control flow; only event acceptance is gated.

The node should depend on `Global.node` and `FSUtil.node`. Do not depend on `Config.node`: current `Config.Service` is location-scoped, while this feature is explicitly process/global and will receive configuration through a later adapter.

**Step 4: Run the focused tests and typecheck**

```bash
cd packages/core
bun test test/diagnostic.test.ts
bun typecheck
```

Expected: service tests pass and Core typecheck passes.

## Task 3: Implement Safe JSONL Serialization and Stream Routing

**Files:**
- Modify: `packages/core/src/diagnostic.ts`
- Modify: `packages/core/test/diagnostic.test.ts`

**Step 1: Add failing writer tests**

Add tests that inspect the temporary diagnostics directory after an explicit flush:

- Enabled session events are written to `diagnostics/YYYY-MM-DD/ses_<safe-id>.jsonl`.
- Instance events without `sessionId` are written to the same UTC date's `instance.jsonl` and do not gain fabricated session or trace IDs.
- Every line is one complete JSON object ending in a newline.
- The envelope has `schema`, `schemaVersion`, unique `eventId`, timestamp, monotonic time, and the correct per-stream `seq`.
- Two sessions write separate streams and retain independent sequence numbers.
- Session IDs containing path separators or traversal text cannot escape the diagnostics root; the generated filename uses a safe encoding or validated identifier.
- The service never invokes `raw` when `rawPayloads` is off. When it is on, the service invokes `raw` once during admission, resolves it outside the business critical path, and passes only the selected value to the writer. The writer stores only that value; it is not a redaction engine.

**Step 2: Implement JSON-safe normalization**

Before `JSON.stringify`, normalize only values that JSON cannot represent safely:

- Preserve strings, numbers, booleans, null, arrays, and plain objects.
- Convert `Error` to the standard error object.
- Represent `bigint`, `Uint8Array`/binary, and other non-JSON values with a stable typed representation and size metadata.
- Detect circular references and replace the recursive edge with a stable marker instead of throwing.
- Never allow serialization failure to escape into the model/tool business path; report the writer failure through ordinary logging and, where possible, increment the dropped-event counters.

This is not a redaction layer: callers must construct summaries without raw content, and the service enforces which candidate can reach the writer. `rawPayloads: true` remains an explicit product decision to preserve sensitive content as received.

**Step 3: Implement date and file routing**

- Use UTC calendar dates for directory names, not local time.
- Resolve the root as `path.join(global.log, "diagnostics")`.
- Route session events to a safe session filename and instance events to `instance.jsonl`.
- Ensure directories are created lazily on the first accepted event, not at service construction when diagnostics are disabled.
- Keep per-stream state in the service instance; do not share a mutable current stream across sessions.

**Step 4: Verify routing and serialization**

```bash
cd packages/core
bun test test/diagnostic.test.ts
bun typecheck
```

Expected: all routing, envelope, and JSON-safety tests pass.

## Task 4: Add Asynchronous Bounded Queueing and Rotation

**Files:**
- Modify: `packages/core/src/diagnostic.ts`
- Modify: `packages/core/test/diagnostic.test.ts`

**Step 1: Add failing queue and rotation tests**

Cover:

- `emit` returns without waiting for disk I/O or an asynchronous raw supplier; `flush` waits for all admitted pending suppliers and writes before its barrier, and provides the explicit durability point used by tests and terminal events.
- Multiple events for one stream are persisted in submission order.
- When the low-priority capacity is full, a low-priority stream/chunk event is dropped while a lifecycle/terminal event is still admitted into reserved high-priority capacity.
- When both low- and high-priority capacities are exhausted, the new event is rejected without unbounded memory growth, the in-memory drop counter increases, and ordinary logging reports the overload.
- Dropped counts produce an instance-level `diagnostic.events_dropped` record with event type counts, time range, and reason.
- An admitted terminal event requests immediate flush and remains readable after low-priority queue pressure.
- A stream rotates at the configured 100 MB threshold, creates `.1`, `.2`, and so on, and preserves sequence numbers across volumes.
- Volume discovery and reading use numeric suffix ordering, so `.2` precedes `.10`.
- A process reopening an existing stream continues its sequence after the last valid persisted line.
- Two independent processes appending to the same stream produce one numeric volume chain with strictly increasing `seq` in persisted order.
- A final incomplete JSONL line is truncated to the last newline under the stream lock before the next append; an invalid complete line in the middle is reported as corruption, not silently skipped.

For tests, use a small injectable rotation threshold and queue capacity plus short lock timeout/stale values in an internal test-only factory option; production defaults remain 100 MB, 100 ms/64-event batching, the design's bounded capacities, and normal `Flock` timings. The two-process test must launch real child processes against one shared temporary log/state directory and always terminate them on test timeout. Do not make the production protocol configurable through undocumented environment variables.

**Step 2: Implement per-stream scheduling**

Use explicit per-stream state with separate bounded handling for high-priority lifecycle/terminal/error events and low-priority stream/phase detail. Reserve a finite portion of capacity for high-priority events and evict queued low-priority events first when necessary. If the reserved high-priority capacity is also exhausted, reject the incoming event, increment an in-memory dropped counter, and report the failure through the ordinary logger; terminal events are prioritized, not guaranteed under unbounded overload. The dropped-event summary itself uses reserved capacity and is emitted once the writer can accept it; it must not recursively generate another diagnostic event.

The business-facing methods must enqueue and return. A single stream writer serializes append and rotation; different streams may write concurrently. `complete`, error, cancellation, and dropped-stat events request an immediate drain. Normal batches use approximately 100 ms or 64 events as the flush trigger.

Define ordering at admission: events retained in a stream's queue are written in their accepted FIFO order, even if an earlier raw supplier resolves after a later one, except that low-priority events may be evicted under pressure. High-priority events do not overtake already accepted events in that stream. `flush(stream)` resolves after all events accepted before the flush barrier are either persisted or explicitly counted as dropped; it does not promise `fsync` durability against power loss.

**Step 3: Implement rotation and sequence recovery**

- Count encoded UTF-8 bytes before append and rotate before the write that would exceed the per-file limit.
- Discover the highest numeric volume for the stream.
- Recover the next `seq` from a bounded tail read of the highest volume (expand the window only if needed to find a complete record), not a full 100 MB scan on every batch. Under the same lock, truncate an incomplete final line to the last newline before appending; do not silently accept a malformed complete tail line. Older middle-record corruption is reported by the reader, not rediscovered by every append.
- Keep sequence monotonic across all volumes and permit gaps caused by dropped events.
- Allocate `seq` only in the writer, after it acquires the cross-process stream lock and recovers the latest persisted sequence. Never assign `seq` at enqueue time: another process may append first, which would make sequence order disagree with file order.
- Use `Flock.acquire()` with an explicit lock directory under the global state path, keyed by the canonical stream identity (UTC date plus session ID, or UTC date plus `instance`). Hold the lock across volume discovery, tail recovery, rotation decision, and append for each batch. The lock must be released on all success and failure paths. Never let two writers create competing `.N` files for one stream.
- Keep the service's per-process queue FIFO and serialize each stream's writer. Cross-process total order is the order in which writers acquire the stream lock; each appended record's `seq` must match that persisted order.
- Do not delete the active file during normal retention work.

**Step 4: Verify queue and rotation behavior**

```bash
cd packages/core
bun test test/diagnostic.test.ts
bun typecheck
```

Expected: queue, ordering, dropped-event, rotation, numeric-volume, and sequence-recovery tests pass.

## Task 5: Add Retention and Failure Isolation

**Files:**
- Modify: `packages/core/src/diagnostic.ts`
- Modify: `packages/core/test/diagnostic.test.ts`

**Step 1: Add failing retention and failure tests**

Test that:

- Startup or explicit `cleanup()` removes date directories older than `retentionDays`.
- `retentionDays: 0` skips date-age deletion but still enforces `maxTotalBytes`.
- Total-size cleanup removes the oldest closed volumes first until both limits are satisfied.
- The active stream is not deleted while it is open.
- A cleanup process cannot delete a stream another process is actively writing: it must acquire the same per-stream lock before deleting a candidate and skip it if the lock cannot be acquired within the cleanup budget.
- Cleanup leaves the diagnostics root in place.
- A write/rotation/cleanup failure is logged through ordinary logging and does not fail the caller's `emit`, model-facing effect, or terminal task operation.
- A JSON serialization failure becomes a safe dropped event rather than an exception escaping the service.
- Disabling diagnostics preserves existing files and stops cleanup/background work from being started solely by disabled state.

**Step 2: Implement cleanup**

Add explicit `cleanup()` to the service. It must:

- Enumerate only the diagnostics root and its date directories.
- Order deletion candidates by UTC date and file modification time, preferring the oldest closed rotated volume.
- Respect active stream state and the configured byte/day limits.
- Bound work per invocation by a reasonable file count/time slice so cleanup cannot monopolize the event loop.
- Use the stream lock when inspecting/deleting rotated files, and never delete the volume currently selected for append. If another process owns the stream lock, leave that stream for the next cleanup pass.
- Record failures only in the existing ordinary logger, never by recursively writing a diagnostic event.

Run cleanup once when diagnostics first become enabled in this process (including a later disabled-to-enabled transition), and expose explicit cleanup for the later settings “立即清理” action. The settings adapter will own user confirmation and dynamic configuration; this task only implements the Core primitive.

**Step 3: Verify failure isolation**

```bash
cd packages/core
bun test test/diagnostic.test.ts
bun typecheck
```

Expected: retention and failure tests pass, with no diagnostic writer error able to fail the surrounding business effect.

## Task 6: Final Foundation Verification

**Files:**
- No new production files.
- Review: `docs/plans/2026-10-20-diagnostic-trace-design.md`
- Review: `docs/plans/2026-10-20-diagnostic-trace-implementation-plan.md`

**Step 1: Run focused package verification**

```bash
cd packages/schema
bun test test/diagnostic.test.ts
bun typecheck

cd ../core
bun test test/diagnostic.test.ts
bun typecheck
```

Do not run tests from the repository root; the repository guard requires package-local commands.

**Step 2: Check the change surface**

```bash
cd ../..
git diff --check
git status --short
git diff --stat
```

Confirm that `bun.lock` retains the user's pre-existing changes and that this phase has not touched runtime business boundaries, settings, HTTP APIs, generated clients, or UI files.

**Step 3: Record the handoff boundary**

Before starting the next implementation phase, confirm the following are true:

- A temporary directory test can create, flush, rotate, reopen, and read a session stream.
- An instance event is stored in `instance.jsonl` without fabricated session fields.
- The sequence and numeric volume rules are tested.
- Queue pressure preserves terminal/error behavior as far as the bounded policy allows and emits dropped statistics.
- Disk and serialization failures are ordinary-log-only failures.
- The service remains disabled by default and has no implicit trace context.

The next plan must then connect the service to the actual global diagnostics settings, followed by shared LLM/Tool/Plugin/MCP/knowledge boundaries and finally Legacy `SessionPrompt`. That boundary-integration plan must test that knowledge adapter events nested under MCP/tool transport events use `parentEventId` and readers aggregate by call tree to avoid counting one retrieval twice. Any `HttpApi` changes require `bun run generate` from `packages/client`; generated files must never be edited directly.

**Step 4: Commit the remaining Core foundation**

```bash
git add packages/core/src/diagnostic.ts packages/core/test/diagnostic.test.ts
git commit -m "feat(core): add diagnostic trace foundation"
```

Task 1's schema commit and this Core commit are intentionally separate reviewable units. Do not stage or commit the pre-existing `bun.lock` change.
