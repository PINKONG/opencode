# MaxKB MCP Browsing UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build first-phase WisCode client browsing UI for MaxKB MCP resources so users can browse datasets, documents, and paragraphs from a connected MaxKB MCP server.

**Architecture:** This phase depends on the transport work from `2026-04-20-maxkb-mcp-transport-integration-plan.md` already being merged. Reuse existing MCP resource discovery, add a small server/SDK surface for `readResource`, add MaxKB-specific Zod schemas for resource payloads, and expose a focused browsing dialog in the TUI rather than overloading prompt-time MCP resource reading.

**Tech Stack:** TypeScript, Bun, Solid, OpentUI, Effect, Zod, Hono, generated `@opencode-ai/sdk/v2`, existing `opencode` TUI sync and MCP resource APIs.

## 1. Dependency

This phase depends on:

- [2026-04-20-maxkb-mcp-transport-integration-plan.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-20-maxkb-mcp-transport-integration-plan.md)

Do not implement this UI plan before transport support is merged and manually validated against a real MaxKB MCP endpoint.

## 2. Scope

### In scope

- TUI-visible browsing entrypoint for MaxKB resources
- resource JSON parsing through explicit Zod schemas
- dataset list view
- dataset → document drill-down
- document → paragraph drill-down
- loading, empty, parse error, and authorization error states

### Out of scope

- MaxKB tool calls
- answer-time retrieval UX
- prompt-time resource injection changes
- non-TUI product surfaces unless separately requested

## 3. Current Reality

Existing foundations:

- `packages/opencode/src/server/instance/experimental.ts`
  - exposes `GET /experimental/resource`
  - can list MCP resources through `MCP.resources()`
  - does not yet expose `MCP.readResource(clientName, uri)`
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx`
  - already syncs MCP resource inventory into store state
  - stores resources in `sync.data.mcp_resource`
- `packages/opencode/src/mcp/index.ts`
  - already exposes `readResource(clientName, uri)`
- `packages/opencode/src/session/prompt.ts`
  - can read resource text, but that path is for prompt assembly, not browsing UI
- `packages/opencode/src/cli/cmd/tui/component/dialog-command.tsx`
  - command palette and slash commands are registered with `useCommandDialog().register()`
- `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`
  - session-scoped slash commands are registered here
  - this is the concrete place to register `/kb`
- `packages/opencode/src/cli/cmd/tui/ui/dialog-select.tsx`
  - existing selectable dialog primitive for drill-down lists
- `packages/sdk/js/script/build.ts`
  - regenerates the JS SDK from server OpenAPI routes

Important MaxKB behavior:

- `resources/list` only reliably advertises `maxkb://datasets`
- parameterized resources should be read directly once ids are known
- resource payloads arrive as JSON strings in `contents[0].text`

This means the browsing UI should not rely on generic resource listing alone. It needs an explicit MaxKB browsing flow.

Spike findings:

1. The TUI stack is Solid on OpentUI, not Ink.
2. `/kb` should be registered in `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx` via `useCommandDialog().register()`.
3. The browsing surface should be a dialog component under `packages/opencode/src/cli/cmd/tui/component/`, using `DialogSelect` and `dialog.replace(...)` for drill-down.
4. TUI code cannot call `MCP.Service` directly. It must call server APIs through `useSDK()`.
5. A server route and regenerated SDK method are required before UI can lazily read parameterized MaxKB resources.

## 4. Interaction Decision

### Recommended interaction

Add a dedicated `/kb` command that opens a MaxKB knowledge browsing flow.

Why `/kb` is the recommended choice:

1. It makes the browsing feature discoverable.
2. It avoids overloading generic MCP resource views with MaxKB-specific semantics.
3. It gives us a clean place to handle three-level drill-down, loading states, and JSON parse errors.
4. It keeps prompt-time MCP resource usage separate from human-facing browsing.

### Rejected alternative

#### Use only a generic `/mcp resources` panel

Rejected because:

- MaxKB parameterized resources are not fully listed through `resources/list`
- dataset/document/paragraph drill-down becomes awkward
- MaxKB-specific JSON parsing and navigation would leak into a generic MCP inspector

## 5. Data Contracts

Use explicit Zod schemas for MaxKB resource payloads.

Schema fixtures:

- `docs/plans/maxkb-manual-validation/05-datasets-payload.json`
- `docs/plans/maxkb-manual-validation/07-documents-payload.json`
- `docs/plans/maxkb-manual-validation/09-paragraphs-payload.json`

These fixtures are redacted, but preserve the real MCP/MaxKB field shapes observed during Phase 1 manual validation.

Schema rule:

- require only the fields needed for browsing
- mark server-specific fields optional unless UI depends on them
- use `.passthrough()` on objects so MaxKB can add fields without breaking the UI
- parse failure still surfaces as an explicit error state

### 5.1 Dataset payload

Based on MaxKB deployment guide observed payload:

```json
{
  "datasets": [
    {
      "id": "6a74c37a-46aa-11f0-a78f-0242ac130002",
      "name": "MoreDev",
      "desc": "MoreDev",
      "document_count": 1,
      "mcp_exposed": true
    }
  ],
  "truncated": false
}
```

Recommended schema:

- `datasets: array`
- `truncated: boolean`

Dataset item:

- `id: string`
- `name: string`
- `desc: string`
- `document_count: number`
- `mcp_exposed: boolean`
- object `.passthrough()`

### 5.2 Document payload

Observed shape from Phase 1 validation fixture:

```json
{
  "dataset": {
    "id": "dataset_id",
    "name": "Dataset Name",
    "desc": "Dataset Desc"
  },
  "documents": [
    {
      "id": "document-fixture-001",
      "dataset_id": "dataset-fixture-001",
      "name": "redacted-document.md",
      "char_length": 12345,
      "status": "nn2",
      "is_active": true,
      "hit_handling_method": "optimization",
      "directly_return_similarity": 0.7,
      "create_time": "2025-08-29T07:20:57.477531Z",
      "update_time": "2025-10-14T02:27:51.202021Z"
    }
  ],
  "truncated": false
}
```

Document item required fields:

- `id: string`
- `dataset_id: string`
- `name: string`

Document item optional display fields:

- `char_length: number`
- `status: string`
- `is_active: boolean`
- `hit_handling_method: string`
- `directly_return_similarity: number`
- `create_time: string`
- `update_time: string`

Use `.passthrough()` for dataset, document item, and root objects.

### 5.3 Paragraph payload

Observed shape from Phase 1 validation fixture:

```json
{
  "dataset": {
    "id": "dataset_id",
    "name": "Dataset Name"
  },
  "document": {
    "id": "document_id",
    "name": "Doc Name"
  },
  "paragraphs": [
    {
      "id": "paragraph-fixture-001",
      "document_id": "document-fixture-001",
      "dataset_id": "dataset-fixture-001",
      "title": "# Redacted Overview",
      "content": "Redacted paragraph content preserving the MaxKB paragraph schema.",
      "status": "nn2",
      "hit_num": 0,
      "is_active": true,
      "create_time": "2025-08-29T07:20:57.480519Z",
      "update_time": "2025-08-29T07:20:57.480564Z"
    }
  ],
  "truncated": false
}
```

Paragraph item required fields:

- `id: string`
- `document_id: string`
- `dataset_id: string`
- `title: string`
- `content: string`

Paragraph item optional display fields:

- `status: string`
- `hit_num: number`
- `is_active: boolean`
- `create_time: string`
- `update_time: string`

Use `.passthrough()` for dataset, document, paragraph item, and root objects.

Rule:

- UI parsing must go through these schemas
- parse failure should show an explicit error state, not silently render an empty list

## 6. UI Flow

### 6.1 Entry

User runs `/kb`.

The command should:

1. list connected MCP servers
2. filter to servers that expose `maxkb://datasets` in `sync.data.mcp_resource`
3. if exactly one MaxKB-like server is available, select it
4. otherwise prompt user to pick a server

MaxKB-capable detection is heuristic:

- treat a server as MaxKB-capable when `resources/list` exposes a resource with `uri === "maxkb://datasets"`
- if the heuristic finds no server, show an error/empty dialog explaining that no MaxKB MCP server is connected
- a later enhancement may add manual server selection, but Phase 1.1 should not require it unless the heuristic proves insufficient

### 6.2 Dataset view

The UI reads:

- `maxkb://datasets`

Render:

- dataset name
- desc
- document count
- `truncated` warning if present

### 6.3 Document view

On dataset selection, read:

- `maxkb://datasets/{dataset_id}/documents`

Render:

- document name
- status
- char length
- update time

### 6.4 Paragraph view

On document selection, read:

- `maxkb://datasets/{dataset_id}/documents/{document_id}/paragraphs`

Render:

- paragraph title
- paragraph content
- active/status metadata as secondary text

## 7. Error States

The browsing UI must explicitly handle:

1. no MaxKB-capable server connected
2. MCP read failure
3. MaxKB auth or authorization failure
4. invalid JSON text
5. schema parse failure
6. empty dataset/document/paragraph list
7. `truncated: true`

Do not silently swallow parse or auth errors into empty lists.

## 8. File-Level Change Plan

### `packages/opencode/src/server/instance/experimental.ts`

Add a resource read route for TUI use.

Recommended route:

- `POST /experimental/resource/read`
- `operationId: "experimental.resource.read"`
- body:
  - `client: string`
  - `uri: string`
- response:
  - MCP SDK `readResource` result as JSON

Implementation uses:

- `AppRuntime.runPromise(MCP.Service.use((mcp) => mcp.readResource(client, uri)))`
- `404` or `400` if the server is missing or disconnected can be handled through existing server error conventions

### `packages/sdk/js/src/v2/gen/*`

Regenerate SDK after adding the route:

```bash
./packages/sdk/js/script/build.ts
```

This should produce a callable method under `sdk.client.experimental.resource`.

### `packages/opencode/src/mcp/maxkb-resource.ts`

Add MaxKB-specific resource parsing helpers and Zod schemas in a dedicated MCP-side helper module, separate from prompt logic.

Exports:

- `MaxkbDatasetPayload`
- `MaxkbDocumentPayload`
- `MaxkbParagraphPayload`
- `parseMaxkbText(text: string, schema: z.ZodType)`
- `extractMaxkbText(result)`

`extractMaxkbText` should read `result.contents[0].text` and throw a descriptive error if missing or non-string.

### `packages/opencode/test/mcp/maxkb-resource.test.ts`

Add schema/parser tests using the redacted fixtures:

- parses `05-datasets-payload.json`
- parses `07-documents-payload.json`
- parses `09-paragraphs-payload.json`
- rejects invalid JSON text
- rejects schema mismatch with explicit error

### `packages/opencode/src/cli/cmd/tui/component/dialog-kb.tsx`

Add the browsing screen or dialog components needed for:

- server selection
- dataset list
- document list
- paragraph list

Implementation shape:

- `DialogKb`
- `DialogKbDatasets`
- `DialogKbDocuments`
- `DialogKbParagraphs`

Use:

- `useSync()` for `sync.data.mcp_resource`
- `useSDK()` for `sdk.client.experimental.resource.read(...)`
- `DialogSelect` for server/dataset/document selection
- `dialog.replace(...)` for drill-down transitions
- disabled `DialogSelect` rows or toast messages for loading/error/empty states

Do not add background sync for documents/paragraphs.

### `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

Register `/kb` in the existing session command registration:

- title: `Browse knowledge base`
- value: `kb.browse`
- category: `MCP`
- slash name: `kb`
- onSelect: `dialog.replace(() => <DialogKb />)`

### `packages/opencode/src/cli/cmd/tui/context/sync.tsx`

Do not overload sync with deep MaxKB document/paragraph fetching by default.

Recommended behavior:

- continue syncing top-level MCP resource inventory only
- fetch MaxKB document and paragraph resources lazily when the `/kb` flow is active

No code change should be needed here unless the route/API shape requires additional typing.

## 9. Testing Strategy

### Unit tests

Add tests in `packages/opencode/test/mcp/maxkb-resource.test.ts` for:

- dataset payload schema parsing
- document payload schema parsing
- paragraph payload schema parsing
- parse failure behavior

Add server route tests if an existing server-route test harness is available. If not, cover the route through a small focused unit around the handler extraction or document it as manual verification.

### SDK generation check

After `./packages/sdk/js/script/build.ts`, verify:

- `packages/sdk/js/src/v2/gen/sdk.gen.ts` contains `experimental.resource.read`
- generated types include the request body and response shape
- `packages/opencode/src/cli/cmd/tui/component/dialog-kb.tsx` typechecks against the generated method

### UI tests

Existing TUI component tests are limited. Prefer unit-testing schema and route behavior first.

If practical, add focused tests for:

- `/kb` entry flow
- dataset selection
- document selection
- paragraph rendering
- error states

If TUI harness coverage is too heavy for this phase, document these as manual validation steps and keep the UI logic small.

### Manual validation

Against real MaxKB:

1. open `/kb`
2. browse datasets
3. open documents
4. open paragraphs
5. verify `truncated` warning if returned

## 10. Acceptance Criteria

Implementation is complete when all of the following are true:

1. Phase 1 transport support is already merged.
2. Server API exposes MCP resource read for TUI/SDK use.
3. JS SDK is regenerated and exposes the new resource read method.
4. A user can open a dedicated MaxKB browsing flow from the TUI using `/kb`.
5. Dataset, document, and paragraph payloads are parsed through Zod schemas validated against redacted fixtures.
6. Parse failures show explicit errors.
7. Users can drill down dataset → document → paragraph.
8. Browsing works against a real MaxKB MCP endpoint.

## 11. Implementation Tasks

### Task 1: Expose MCP resource read API

**Files:**
- Modify: `packages/opencode/src/server/instance/experimental.ts`
- Test: existing server route test if available, otherwise document manual API validation

**Steps:**

1. Add request body schema with `client` and `uri`.
2. Add `POST /experimental/resource/read`.
3. Call `MCP.Service.readResource(client, uri)`.
4. Return the MCP read result as JSON.
5. Run package tests that cover server route compilation.

### Task 2: Regenerate JS SDK

**Files:**
- Modify generated files under `packages/sdk/js/src/v2/gen/`

**Steps:**

1. Run `./packages/sdk/js/script/build.ts`.
2. Verify generated SDK exposes `experimental.resource.read`.
3. Do not hand-edit generated files.

### Task 3: Add MaxKB resource schemas

**Files:**
- Create: `packages/opencode/src/mcp/maxkb-resource.ts`
- Create: `packages/opencode/test/mcp/maxkb-resource.test.ts`
- Fixture inputs: `docs/plans/maxkb-manual-validation/05-datasets-payload.json`, `07-documents-payload.json`, `09-paragraphs-payload.json`

**Steps:**

1. Write tests against the redacted fixtures.
2. Add schemas with minimum required fields and `.passthrough()`.
3. Add JSON text extraction/parsing helpers.
4. Verify invalid JSON and invalid schema cases fail loudly.

### Task 4: Add MaxKB browsing dialog

**Files:**
- Create: `packages/opencode/src/cli/cmd/tui/component/dialog-kb.tsx`

**Steps:**

1. Build MaxKB-capable server list from `sync.data.mcp_resource`.
2. Read `maxkb://datasets` lazily through SDK resource read.
3. Render dataset selection with `DialogSelect`.
4. On dataset select, read and render documents.
5. On document select, read and render paragraphs.
6. Show explicit loading, empty, read error, invalid JSON, and schema parse states.

### Task 5: Register `/kb`

**Files:**
- Modify: `packages/opencode/src/cli/cmd/tui/routes/session/index.tsx`

**Steps:**

1. Import `DialogKb`.
2. Add command entry in `command.register`.
3. Set category to `MCP`.
4. Set slash name to `kb`.
5. Open `DialogKb` with `dialog.replace`.

### Task 6: Manual validation

**Steps:**

1. Configure a real MaxKB MCP server.
2. Start TUI.
3. Run `/kb`.
4. Browse dataset → document → paragraph.
5. Verify error messages by disabling the MaxKB server or using invalid auth in a local test config.
