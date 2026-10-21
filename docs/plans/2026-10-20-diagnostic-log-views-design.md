# Diagnostic Log Views Design

Status: reviewed and approved as the implementation baseline. This document specifies a read-only CLI view over the existing diagnostic JSONL protocol.

## 评审摘要

- **三种作用域**：默认汇总所有会话与实例事件的最近 100 条可见记录；`--session` 只看指定会话（跨天、跨分卷）；`--trace` 沿 `parentTraceId` 展开跨会话的子代理任务，不把 `followsTraceId` 错认作子任务。
- **只做 CLI**：`tail` 输出紧凑时间线，`show <eventId> --raw` 才展开敏感原文。JSONL 存储、诊断开关和清理策略不变；Web 无日志入口，本轮不做 Desktop 内嵌查看器。
- **正确性优先**：默认最近 N 条采用流式全量扫描和有界内存 Top-N；trace 无索引时需要两遍扫描；`--follow` 用文件观察加周期复扫，不能仅依赖 `fs.watch`。这会带来最多约 2 GB（当前卷可能更多）的读取成本，不能假装“各文件读尾部 N 行”或“按 mtime 剪枝”就精确。
- **展示不等于账单**：`status` 不是日志级别；任务完成事件没有 token/cost。请求级和 step 级 usage 分开显示，不重复相加；stream chunk 默认隐藏，raw 永不进入 `tail` 单行摘要。
- **评审重点**：是否接受精确扫描的启动成本；`--trace` 的子任务边界；`show --raw` 的敏感数据暴露方式；以及本轮只交付 CLI 的产品范围。

已核实的代码事实：`packages/core/src/diagnostic.ts` 按 UTC 日期、session/instance 与数字分卷写 JSONL；`packages/schema/src/diagnostic.ts` 定义 v1 envelope 和状态枚举；`packages/opencode/src/session/prompt.ts` 写入父子 trace 链接；`packages/opencode/src/session/processor.ts` 产生带真实 `partId` 的 `llm.step.completed`。现有 `packages/opencode/src/cli/cmd/diagnostics.ts` 只有 status、cleanup、clear，尚无读取视图。本文件是新增设计，不修改上述运行时代码。

## 1. Goal And Boundary

The existing `diagnostics/<UTC-date>/ses_*.jsonl` and `instance.jsonl` files remain the source of truth. Developers need a compact, chronological view comparable in scanning speed to a conventional application log, without losing the structured records needed for `jq`, token reconciliation, and raw provider inspection.

This change adds `wiscode diagnostics tail` with three scopes and `wiscode diagnostics show <eventId>` for one event. It does not change the writer, envelope schema, rotation, retention, or the existing `status`/`cleanup`/`clear` commands. It adds no HTTP log-reading endpoint and no Web settings or log viewer. The existing Desktop-only log settings remain; a Desktop viewer is outside this version.

The reader works while capture is disabled and can inspect retained files. It reads only the local `DiagnosticTrace.root()` selected by the running installation; no arbitrary root, remote path, upload, or provider call is involved. Raw payloads may contain credentials and private code, so they are never included in `tail` lines.

## 2. Choice Of Approach

| Approach | Benefit | Cost | Decision |
| --- | --- | --- | --- |
| Replace JSONL with text | Directly readable in any editor | Breaks structured queries, exact correlation, and existing readers | Reject |
| Write JSONL and a second `.log` | Directly readable file | Double-write consistency, extra disk, retention and recovery complexity | Defer |
| Read-only formatter over JSONL | No protocol change; different views can be derived later | Reader has to discover, merge, and format files | Adopt |

Oversized raw payloads are not moved to sidecar files in this version. `show --raw` first addresses their readability; a sidecar would require a separate protocol and retention design.

## 3. CLI Contract

```text
wiscode diagnostics tail [--session ses_ID | --trace trace_ID]
                         [--since RFC3339] [--until RFC3339]
                         [--limit N] [--event GLOB] [--status STATUS]
                         [--follow] [--chunks] [--ids] [--utc]
wiscode diagnostics show evt_ID [--raw] [--utc]
```

- No scope flag means all retained session streams plus `instance.jsonl`, across UTC date directories. `--session` includes only the named session, even when it spans dates and numeric volumes; it does **not** include subagents or instance events. `--trace` includes the named trace and transitive child traces across sessions. The scope flags are mutually exclusive.
- `tail` without `--follow` returns the latest 100 matching display rows in the scope's display order: timestamp order for global/trace, recorded stream order for session. `--limit` is a positive integer; set an explicit upper bound (proposed 10,000) to avoid unbounded terminal output. `--since`/`--until` require a timestamp with timezone and are inclusive at millisecond precision. They filter events, not directory names; directory selection may only be an optimization. Invalid dates, IDs, globs, limits, and contradictory time bounds fail before reading.
- `--event` matches the complete event name, with `*` as the only wildcard (for example `llm.*`); `--status` accepts the schema's status values. Filters are applied before `--limit`. Unknown future event names remain visible by default.
- `--follow` first prints the latest matching rows, then appends newly completed JSONL records until interrupted. `--limit` applies only to the initial snapshot, not the live stream. `--until` is incompatible with `--follow`; `--since` still filters both. Ctrl-C closes watchers and exits normally.
- A named `--session` or `--trace` that has no retained records in its scope exits nonzero, including with `--follow`. A scope that exists but has no rows after time/event/status filters exits zero with an empty-state message. An unscoped empty root also exits zero. For `--trace`, retained child records linked to an expired root count as an existing scope.
- `show` searches all retained files for the exact full `eventId`. It prints the envelope and summary with readable indentation. `--raw` additionally prints the unredacted raw payload and must never imply redaction. A missing ID exits nonzero; duplicate IDs, if encountered, are reported as corruption rather than choosing one. `tail --ids` exposes full `eventId`, `sessionId`, `traceId`, `turnId`, and source path/volume so an event can be passed to `show` without guessing an abbreviated ID.
- Default timestamps render as local time with numeric UTC offset (`YYYY-MM-DD HH:mm:ss.SSS +HH:MM`); `--utc` renders UTC with `Z`. ANSI color is used only when stdout is a TTY and color is enabled; redirected output is plain UTF-8. stdout contains records; stderr contains TTY-only scan progress, partial-snapshot warnings, and errors. Exit status is nonzero for invalid options, missing named scopes, I/O failure, or a corrupt complete record; no silent success with partial history.

Examples:

```text
wiscode diagnostics tail
wiscode diagnostics tail --session ses_abc --since 2026-10-20T00:00:00Z
wiscode diagnostics tail --trace trace_abc --event 'llm.*' --ids
wiscode diagnostics tail --follow --status failed
wiscode diagnostics show evt_abc --raw
```

## 4. Three Scope Semantics

### 4.1 Global

Read all valid session and instance streams in the retained diagnostic root. The initial snapshot is the most recent N **matching display rows**, not merely today's files, the latest N files, or every record ever written. A session name is shown in a fixed-width abbreviated column; instance events show `(inst)`. Full IDs remain available with `--ids`.

The global view is the machine-wide timeline. A timestamp from one process is not proof that its event caused another process's event; `monotonicMs` is process-local and is never used to order streams.

### 4.2 Session

Find every UTC day and numeric volume for the exact session ID. Preserve the recorded stream sequence for that session, including across volumes; a cross-day boundary starts a new stream sequence, so the timestamp/date places the days. A child session remains separate even when its task was started by this session. This is the narrowest predictable view for debugging one conversation.

Filename discovery must use the same session encoding rule as the writer (`ses_` prefix plus encoded ID), ideally via a shared helper rather than duplicating path construction. Validate requested IDs and match the parsed envelope's `sessionId` as well; never interpolate an untrusted ID into a filesystem path.

### 4.3 Trace

Scan candidate records and build a set beginning with the requested `traceId`. Repeatedly add a child's `traceId` when its `parentTraceId` is already in the set. `task.child.started` can identify a child early and supplies a fallback link through `payload.summary.childTraceId`; it is not a substitute for inspecting the child stream. Include events whose `traceId` belongs to this transitive set, even when they live in different session files. Keep the parent task's tool events and child task's LLM/usage events visible on one timeline. Display an explicit parent/child marker, never pretend that all rows belong to one session.

`followsTraceId` indicates a subsequently admitted prompt in the same session and is **not** a child edge. It can be shown as an annotation but does not expand `--trace` unless the user explicitly selects that new trace. Missing/deleted parent or child files yield the available partial chain with an explicit warning when a recorded `childTraceId` has no matching child records. A root trace whose own records expired may still have retained children linked by `parentTraceId`; display those children with a partial-chain warning. Only when neither the requested trace nor any linked child records remain should the query return not-found.

Trace discovery is potentially expensive without an index. The graph-building pass scans all retained files even when `--since`/`--until` or an event/status filter is set; those filters apply to displayed records only, after linkage is resolved. This keeps an older parent/child link from disappearing merely because its timestamp precedes `--since`. A bounded `--since` narrows output but does not reduce the initial graph scan; help text must not suggest otherwise. No hidden time window or silent scan cap may drop child usage. For long scans, show a throttled single-line file/byte progress indicator on TTY stderr; keep redirected stderr silent except for warnings and errors. Indexing is a later optimization and must not change result semantics.

## 5. Discovery, Ordering, And Resource Use

The common reader lives in Core (filesystem discovery, incremental JSONL parsing, schema-version handling, trace linkage and query filtering). The CLI in `packages/opencode/src/cli/cmd/diagnostics.ts` owns argument validation and text rendering. The reader consumes `DiagnosticTrace.root()` and has no dependency on the app, browser, server HTTP API, or location-scoped project config.

Discover only `YYYY-MM-DD` directories and `instance(.N)?.jsonl` / encoded `ses_*(.N)?.jsonl` names under that root; ignore unrelated files and symlinks. Sort volumes numerically (`.2` before `.10`). Use streaming reads with bounded buffers, not `readFile()` of a whole volume. A complete line may be very large when `rawPayloads` is on: define a configurable per-record safety ceiling (proposed 64 MiB), fail with file and line if exceeded, and never truncate it into a plausible event. Validate required envelope fields and `schemaVersion`; preserve unknown event names and payload keys. A final unterminated line is ignored while the file is being written; a complete malformed middle line reports file and line and causes nonzero exit. No reader operation repairs or deletes files.

For the **exact** initial global snapshot, scan candidate retained records once, filtering as early as possible, and keep only the latest N display rows in a bounded top-N structure. Parse one complete record at a time, then retain only a compact display projection (order key, IDs, event, status, duration and bounded summary fields); discard `payload.raw` immediately. `show` is the only command that retains a full matching record for rendering. Trace view needs two streaming passes without an index: the first builds the trace graph from `traceId`/`parentTraceId` and `task.child.started` links; the second filters events against the complete graph and selects the latest N rows. Memory is proportional to N compact projections, discovered trace IDs and one capped record, not N raw payloads or the number of all events. I/O is proportional to retained bytes (up to the configured 2 GB target, possibly more because active volumes are protected); trace view may read them twice. Do not claim that reading N lines from each file is exact: wall clocks can move backward and timestamps from separate writers need not be monotonic. File `mtime` is not a safe upper bound for contained event timestamps: the writer timestamps at `emit`, then appends later, and the system clock can move backward arbitrarily between those steps. A fixed 24-hour margin is still not a proof. `mtime` may prioritize scan order but must not skip files in exact mode; a future verified per-file maximum-timestamp index or explicitly approximate mode needs a separate contract. `--session` may use its filename to avoid unrelated streams.

Discovery and reading are not a transaction with retention or manual clear. If a discovered file disappears before it is opened, report one partial-snapshot warning and continue with the files still available; permission failures and other I/O errors remain fatal. If an already open file is truncated or replaced during the snapshot, the reader makes a best-effort single pass: it may omit records from that concurrently changing file, but it must never treat an incomplete tail as a record or emit a malformed record. It does not retry the file because a retry cannot provide a transactional view and can duplicate or retain stale projections. The displayed latest N is exact over the stable files successfully scanned, not a promise to reconstruct records changed or deleted concurrently.

Display order and latest-N selection in global/trace views use timestamp ascending; ties use normalized stream key (UTC date + filename) and numeric `seq`, then `eventId` solely for deterministic final tie-breaking. `eventId` is generated from a descending identifier and must **not** be treated as causal or chronological. The session view selects the latest N by UTC day, numeric volume and recorded `seq`, then displays them in that order; clock regressions may therefore make displayed wall times go backward. For rows from different streams in the same millisecond, the stable tie-break is only presentation order, not causal order. Deduplicate only when the same physical record is rediscovered during follow, using stream identity plus day/volume/seq; do not collapse two distinct events sharing a timestamp.

For `--follow`, take an initial snapshot and remember per-file byte offsets and partial trailing bytes. Install observation and reconcile offsets against file identity/size before emitting the first live batch, so writes between snapshot and watcher registration are not lost. Watch the currently relevant day directories and root for low-latency wakeups, but poll periodically (proposed 1 second) as a correctness fallback; `fs.watch` alone is insufficient. On each wakeup discover new sessions, numeric volumes and the new UTC day; read complete appended lines only, retaining partial UTF-8/JSONL bytes until newline arrives. When a file is truncated, replaced, removed by retention or cleared manually, detect it by file identity and size, increment that path's cursor generation, reset its offset, and emit a concise stderr notice. Deduplicate watcher notifications by file identity, generation and byte offset; never deduplicate solely by filename and `seq`, which can restart at zero after manual clear. When a trace view discovers a child link after child records have already been written, backfill that child's retained stream and deduplicate against the same physical cursor positions. Keep watcher count bounded and release watchers on exit. Follow ordering is arrival/best-effort across files, not a global transaction; a small reorder buffer may improve appearance but cannot guarantee causal order across processes.

## 6. Human-Readable Rendering

Default rows are one physical terminal line, approximately:

```text
2026-10-21 11:13:24.001 +08:00 ses_…lkZt INFO  task.started          started      agent=build
2026-10-21 11:13:36.900 +08:00 ses_…lkZt INFO  llm.step.completed    succeeded    in=28051 out=93 cacheRead=0
2026-10-21 11:13:37.100 +08:00 ses_…lkZt ERROR tool.failed           failed       126ms name=web_search stage=tool
```

Render `timestamp | session | derived level | event | status | duration | type-specific summary`. `status` remains its lifecycle value; level is display-only (`failed` -> ERROR, `cancelled`/`dropped` -> WARN, ordinary lifecycle -> INFO, high-frequency chunks/phases -> DEBUG if explicitly shown). Never write this derived level back into JSONL. Escape newlines and control characters in a row, cap ordinary summary text to terminal width, and keep the full value in `show`; no raw response body appears in `tail`.

| Event family | Preferred summary |
| --- | --- |
| `task.*` | agent, message ID, parent/child link when present; **do not invent** turns, tokens or cost from `task.completed` |
| `llm.request.started` | provider, model, querySource, attempt, message/tool counts |
| `llm.request.completed` | reason, total duration, time-to-first-token, request-level usage when present |
| `llm.step.completed` | step, `partId`, input/output/cache-read/cache-write/reasoning tokens and cost when present |
| `tool.*` | tool name/kind, permission decision, duration, error stage on failure |
| `plugin.*`, `knowledge.*`, `context.*` | plugin/source identifier, action, size or count, duration |
| `processing.phase.*` | phase name, duration and key count; unknown phases fall back to safe key/value summary |
| unknown event | event name, status, duration and a bounded summary-key preview |

For accounting, show request-level usage and step-level usage as **different roles** (`request-total` and `step-billed`). Never sum both into a task total. Any future rollup must use one documented source (step-billed for SQLite reconciliation), explicitly handle missing steps and report incomplete totals. The sample's `task.completed` contains only `messageId`; a fabricated `turns=... tokens=... cost=...` line would be incorrect.

`llm.stream.chunk` is hidden by default because hundreds of chunks obscure lifecycle events. A request row uses its persisted `normalizedResponse` byte counts when present; it does not infer total chunk count from potentially dropped chunk events. `--chunks` displays individual chunk rows with kind/index/byte count but still no raw text. This behavior applies before `--limit`, so 100 means 100 visible rows, not 100 hidden chunks.

`show` prints a readable envelope and `payload.summary`; `--raw` adds pretty-printed raw values. When a provider response body is SSE text, parse its `data:` frames into numbered chunks and render each frame as indented JSON where valid. Preserve `[DONE]`, comments and non-JSON frames in the view, and fall back to escaped original text on malformed SSE. Rendering may change whitespace but never modifies the stored JSONL; the original escaped body remains available there for byte-level inspection. Large raw output should be streamable and work with shell redirection or a pager. No automatic `show` call or raw preview occurs in `tail`.

## 7. Errors And Security

- Missing root or an existing scope with no filtered matches returns a short empty-state message without creating the directory and exits zero. A missing explicitly named session/trace or `show` event exits nonzero. Invalid input and I/O failure are nonzero. Partial final lines are normal during follow; completed malformed lines are not. Error output includes path, volume and line/offset, without printing raw payload content.
- `show --raw` prints secrets exactly as stored. Help text and command output identify this risk; do not send it to application telemetry, error reporting, or a Web API. Respect redirected stdout (no ANSI); do not log the contents of raw payloads during parser errors.
- Symlinks and path traversal must not escape `DiagnosticTrace.root()`. `--session`, `--trace` and `eventId` are identifiers/filters, never filesystem paths. Reader is read-only and does not take writer locks; concurrent append, rotation, clear and retention are handled by snapshot/cursor rules.
- A missing or malformed `schemaVersion` is an explicit unsupported/corrupt record error. Future supported versions require a versioned decoder; do not reinterpret a newer envelope as v1. Keep the original record for `show` when successfully decoded.

## 8. Test And Acceptance Matrix

1. Fixture streams across two UTC days, `instance.jsonl`, `.2` and `.10` volumes: global selects the exact latest 100 visible rows and sorts numeric volumes correctly; session reads only its own files.
2. Same-millisecond events in parallel sessions and a clock-regressed session: ordering is deterministic, same-stream sequence is preserved in session view, and the UI makes no causality claim. A test forces the precise case where per-file tail-N would miss a later timestamp in an earlier record.
3. Parent -> child -> grandchild trace spread over separate sessions, with an unrelated session and a `followsTraceId` prompt: trace includes transitive children, excludes the unrelated/following trace, and exposes partial-chain warnings after retention removes a child.
4. Filters (`since`, `until`, `event`, `status`) combine before limit; boundary timestamps are inclusive; bad IDs/dates/globs/limits fail clearly. A valid but absent named scope exits nonzero, while an existing scope with zero filtered rows and an empty global root exit zero.
5. `--follow` observes append, partial line completion, new session, `.N` rotation, UTC day change, watcher miss recovered by poll, concurrent clear/truncate and Ctrl-C shutdown without duplicate rows; after clear, a new `seq=0` event is still shown.
6. Huge raw record and SSE provider body: `tail` emits one bounded summary line; `show` omits raw by default and `show --raw` renders frames without changing content or swallowing malformed frames.
7. Missing directory, unsupported schema, malformed middle line, symlink, permission denial and I/O failure behave as specified; no log read creates or rewrites a diagnostic file.
8. Request-total and step-billed usage remain distinct. Any aggregate reconciles only step-billed usage with SQLite; no double count. Unknown future event names still render a fallback row.
9. Core reader and CLI tests run from their package directories with `bun test` and `bun typecheck`; verify on macOS and Windows using real retained logs, including Windows console encoding and file-watcher behavior. On Windows, hold a reader file handle during manual `clear`: deletion may succeed or return `skipped` depending on file sharing; neither outcome may corrupt the reader, and a later successful clear must let follow observe a replacement file with restarted `seq`. Web settings do not expose the viewer.
10. A cold large scan shows throttled TTY stderr progress with files and bytes scanned, and redirected stderr has no progress chatter. A clock-backward fixture with a recent event in a low-`mtime` file proves exact global results are not pruned by `mtime`.

## 9. Implementation Order After Review

1. Add a read-only Core discovery/parser/query API with synthetic fixtures covering malformed records, rotation and exact latest-N selection.
2. Add CLI rendering plus global/session snapshots, followed by trace graph expansion and `show`/SSE formatting.
3. Add incremental `--follow` with poll fallback, rotation/day-switch tests and real-log smoke tests on macOS and Windows.

No code or generated SDK change is required for this design review. If later a Desktop viewer is approved, it can reuse the Core reader through a separately reviewed, bounded and authenticated local API; it must not silently make raw logs accessible from Web.

`tail --json` is deferred: the first release has one human-readable rendering contract, while retained JSONL already supports machine processing. A separate review can define a stable projected JSON schema and streaming error semantics if scripted consumption becomes a requirement.
