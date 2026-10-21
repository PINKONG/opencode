# Diagnostic Log Views Implementation Plan

Status: Core reader, CLI snapshots/show, and follow are implemented and verified on macOS. Follow tolerates a file disappearing during trace backfill and reports cursor resets. Snapshot reads are best-effort for files concurrently truncated or replaced; Windows file-handle/clear behavior and a Windows CLI smoke test remain release acceptance gates.

**Goal:** Add read-only global, session, and cross-session trace diagnostic views to the WisCode CLI.

**Architecture:** Keep the JSONL writer and schema unchanged. A Core reader discovers and parses retained streams, projects bounded summaries, and resolves trace descendants. The CLI validates options and renders snapshots, raw event details, and incremental follow output.

**Tech Stack:** Bun, TypeScript, Effect schema, yargs, bun:test.

## Task 1: Core Reader

**Files:** `packages/core/src/diagnostic-reader.ts`, `packages/core/test/diagnostic-reader.test.ts`.

1. Add failing fixtures for UTC dates, numeric volumes, same-time ties, clock rollback, filtered empty scope, malformed and partial lines, and parent/child/grandchild links.
2. Run `bun test test/diagnostic-reader.test.ts` from `packages/core`; confirm failure.
3. Implement read-only discovery, bounded line parsing, snapshot selection, named-scope existence, and event lookup without changing writer files.
4. Rerun focused tests and `bun typecheck` in `packages/core`.

## Task 2: CLI Snapshots And Show

**Files:** `packages/opencode/src/cli/cmd/diagnostics.ts`, `packages/opencode/src/cli/cmd/diagnostic-format.ts`, `packages/opencode/test/cli/diagnostics.test.ts`.

1. Add failing CLI tests for global/session/trace, filters and exit codes, one-line safe rendering, and `show --raw` SSE output.
2. Run the focused CLI test and confirm failure.
3. Add yargs options, Core reader calls, readable formatter, and explicit raw rendering.
4. Rerun focused tests and `bun typecheck` in `packages/opencode`.

## Task 3: Follow

**Files:** `packages/core/src/diagnostic-reader.ts`, `packages/core/test/diagnostic-reader.test.ts`, `packages/opencode/src/cli/cmd/diagnostics.ts`, `packages/opencode/test/cli/diagnostics.test.ts`.

1. Add failing tests for append, partial line, new stream, rotation, replaced file with reset sequence, trace child backfill, and abort cleanup.
2. Implement watcher-assisted polling with file identity and byte-offset cursors; keep stdout records separate from stderr progress/warnings.
3. Run focused tests and typechecks in both packages.
4. Smoke-test with a real retained log on macOS; leave Windows file-handle/clear behavior as an explicit Windows acceptance gate, not a cross-build claim.

Do not commit unrelated pre-existing worktree changes. Do not implement Web or an HTTP log-reading endpoint.
