# Diagnostic Log Category Filter Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add a persistent, dynamically applied diagnostic event-category allowlist so users can write only LLM events while preserving full logging by default.

**Architecture:** Validate an optional non-empty category array in the global configuration, map the complete global diagnostics block through one Core-owned pure function, and filter events at `DiagnosticTrace.emit()` before serialization or raw payload evaluation. Add a narrow `categories: null` update marker for removing the persisted restriction, expose nullable status, regenerate public clients, and add the same localized category controls to both desktop settings implementations.

**Tech Stack:** Effect Schema, Core DiagnosticTrace, OpenCode HttpApi, jsonc-parser, Bun tests, SolidJS settings components, generated TypeScript clients.

### Task 1: Update the guide and establish failing Core tests

**Files:**
- Modify: `docs/wiscode-diagnostics-guide.md:128`
- Modify: `packages/core/test/diagnostic.test.ts`
- Modify: `packages/core/test/config/config.test.ts`

**Step 1: Add tests for category validation and event admission**

Cover default-all behavior, `categories: ["llm"]`, raw supplier non-execution for filtered events, streaming independence, empty/unknown category rejection, and configuration mapping defaults.

**Step 2: Run the focused tests and verify they fail for the missing category behavior**

Run from package directories:

```bash
cd packages/core && bun test test/diagnostic.test.ts test/config/config.test.ts
```

Expected: failures because the schema, runtime config, mapping, and filter do not yet exist.

**Step 3: Correct the guide wording**

Replace the obsolete browser path claim with the desktop-only behavior already established in the guide's settings section.

### Task 2: Implement Core schema-compatible runtime filtering

**Files:**
- Modify: `packages/core/src/diagnostic.ts`
- Modify: `packages/core/test/diagnostic.test.ts`

**Step 1: Add `categories` to the runtime config and shared mapping**

Export a Core-owned `fromConfig` function that maps the full diagnostics input, including defaults and `undefined` for unrestricted categories. Keep `configure()` replacement semantics.

**Step 2: Add the minimal emit admission filter**

Compute the event family from the first dot-separated segment. Return before summary serialization, raw supplier evaluation, queue accounting, or sequence allocation when the family is not allowed. Preserve writer-owned `diagnostic.*` events, which bypass `emit()`.

**Step 3: Run Core focused tests and typecheck**

```bash
cd packages/core && bun test test/diagnostic.test.ts test/config/config.test.ts
cd packages/core && bun typecheck
```

### Task 3: Add global config schema and explicit category deletion

**Files:**
- Modify: `packages/core/src/v1/config/config.ts`
- Modify: `packages/opencode/src/config/config.ts`
- Modify: `packages/opencode/test/config/config.test.ts`

**Step 1: Add the non-empty category schema**

Validate only the seven supported categories, reject empty arrays and unknown values, and keep the field optional.

**Step 2: Add an update request type carrying `patch` and `deletes`**

Keep persisted `ConfigV1.Info` free of `null`. Make `updateGlobal` accept the validated patch plus a narrow deletion path for `diagnostics.categories`.

**Step 3: Implement JSON and JSONC deletion**

For JSON, remove the field before serialization. For JSONC, add an explicit deletion branch using `jsonc-parser` edits and preserve unrelated comments/content.

**Step 4: Add red tests for omission, replacement, null deletion, and invalid input on both JSON and JSONC**

Run:

```bash
cd packages/opencode && bun test test/config/config.test.ts
```

Expected: tests fail until the update service and schemas are implemented.

### Task 4: Wire all OpenCode configuration consumers through the shared mapping

**Files:**
- Modify: `packages/opencode/src/server/routes/instance/httpapi/groups/global.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/handlers/global.ts`
- Modify: `packages/opencode/src/cli/cmd/diagnostics.ts`
- Modify: `packages/opencode/src/plugin/index.ts`
- Modify: `packages/opencode/src/session/prompt.ts`
- Modify: `packages/opencode/src/server/routes/instance/httpapi/handlers/project-copy.ts`
- Modify: related tests under `packages/opencode/test/`

**Step 1: Replace hand-written diagnostic config literals**

Use the Core mapping for every business `configure()` call. Preserve complete config replacement so categories cannot disappear when another setting changes.

**Step 2: Add nullable status and request schema handling**

Return `categories: null` when the persisted config has no restriction. Accept `categories: null` only as the narrow update deletion marker and verify the resulting response no longer contains the field, allowing new clients to report old-server incompatibility.

**Step 3: Add regressions**

Cover status round-tripping, old-client omission preserving categories, null deletion, and diagnostics-only updates not disposing active instances.

### Task 5: Regenerate public clients and update CLI behavior

**Files:**
- Generated by scripts under `packages/client/src/generated*`
- Generated legacy SDK output under `packages/sdk/js`
- Modify: `packages/opencode/src/cli/cmd/diagnostics.ts` if status output needs category display

**Step 1: Generate clients from the updated HttpApi**

```bash
cd packages/client && bun run generate
cd ../.. && ./packages/sdk/js/script/build.ts
```

Do not edit generated files manually.

**Step 2: Run client checks**

```bash
cd packages/client && bun typecheck && bun test
```

### Task 6: Add desktop category controls and i18n

**Files:**
- Modify: `packages/app/src/components/settings-logs.tsx`
- Modify: `packages/app/src/components/settings-logs.test.tsx` or existing diagnostic settings tests
- Modify: locale dictionaries under `packages/app/src/i18n/`

**Step 1: Add localized category labels and descriptions**

Use the existing typed language API. Add “all events” and “LLM only” actions plus checkbox selection for the seven categories. Removing the final selected category must be prevented in the UI.

**Step 2: Implement persistence semantics**

Use `categories: null` when returning to all events; preserve categories while changing enabled/raw/streaming. Reconcile server state after failed updates.

**Step 3: Test both settings variants and i18n**

```bash
cd packages/app && bun test src/components/diagnostic-settings.test.ts
cd packages/app && bun typecheck
```

### Task 7: Full verification and documentation consistency

**Files:**
- Modify: `docs/wiscode-diagnostics-guide.md` if implementation wording needs final alignment

**Step 1: Run focused package tests and typechecks**

```bash
cd packages/core && bun test test/diagnostic.test.ts test/config/config.test.ts && bun typecheck
cd ../opencode && bun test test/config/config.test.ts test/server/httpapi-global.test.ts && bun typecheck
cd ../app && bun test src/components/diagnostic-settings.test.ts && bun typecheck
cd ../client && bun typecheck
```

**Step 2: Run `git diff --check` and inspect generated diffs**

Confirm `bun.lock` is untouched by this work and no generated file was edited manually.

**Step 3: Record remaining manual gates**

Keep macOS and Windows desktop verification for category save, restore-all deletion, dynamic switching without session disposal, and LLM-only subagent trace behavior.
