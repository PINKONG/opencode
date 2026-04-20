# MaxKB MCP Browsing UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build first-phase WisCode client browsing UI for MaxKB MCP resources so users can browse datasets, documents, and paragraphs from a connected MaxKB MCP server.

**Architecture:** This phase depends on the transport work from `2026-04-20-maxkb-mcp-transport-integration-plan.md` already being merged. Reuse existing MCP resource discovery and `readResource` APIs, add MaxKB-specific Zod schemas for resource payloads, and expose a focused browsing interaction in the TUI rather than overloading prompt-time MCP resource reading.

**Tech Stack:** TypeScript, Bun, Solid, OpentUI, Effect, Zod, existing `opencode` TUI sync and MCP resource APIs.

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
  - can list MCP resources
- `packages/opencode/src/cli/cmd/tui/context/sync.tsx`
  - already syncs MCP resource inventory into store state
- `packages/opencode/src/mcp/index.ts`
  - already exposes `readResource(clientName, uri)`
- `packages/opencode/src/session/prompt.ts`
  - can read resource text, but that path is for prompt assembly, not browsing UI

Important MaxKB behavior:

- `resources/list` only reliably advertises `maxkb://datasets`
- parameterized resources should be read directly once ids are known
- resource payloads arrive as JSON strings in `contents[0].text`

This means the browsing UI should not rely on generic resource listing alone. It needs an explicit MaxKB browsing flow.

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

### 5.2 Document payload

Expected shape from current MaxKB implementation:

```json
{
  "dataset": {
    "id": "dataset_id",
    "name": "Dataset Name",
    "desc": "Dataset Desc"
  },
  "documents": [
    {
      "id": "document_id",
      "dataset_id": "dataset_id",
      "name": "Doc Name",
      "char_length": 12000,
      "status": "success",
      "is_active": true,
      "hit_handling_method": "optimization",
      "directly_return_similarity": 0.9,
      "create_time": "2026-04-17T10:00:00Z",
      "update_time": "2026-04-17T10:00:00Z"
    }
  ],
  "truncated": false
}
```

### 5.3 Paragraph payload

Expected shape from current MaxKB implementation:

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
      "id": "paragraph_id",
      "document_id": "document_id",
      "dataset_id": "dataset_id",
      "title": "Paragraph Title",
      "content": "Paragraph content",
      "status": "success",
      "hit_num": 0,
      "is_active": true,
      "create_time": "2026-04-17T10:00:00Z",
      "update_time": "2026-04-17T10:00:00Z"
    }
  ],
  "truncated": false
}
```

Rule:

- UI parsing must go through these schemas
- parse failure should show an explicit error state, not silently render an empty list

## 6. UI Flow

### 6.1 Entry

User runs `/kb`.

The command should:

1. list connected MCP servers
2. filter to servers that expose `maxkb://datasets`
3. if exactly one MaxKB-like server is available, select it
4. otherwise prompt user to pick a server

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

### `packages/opencode/src/cli/cmd/...`

Add a `/kb` command entrypoint in the existing command system.

Exact file choice depends on current command registration layout, but the implementation should live in the TUI command layer rather than the prompt/session layer.

### `packages/opencode/src/mcp/...`

Add MaxKB-specific resource parsing helpers and Zod schemas in a dedicated MCP-side helper module, separate from prompt logic.

### `packages/opencode/src/cli/cmd/tui/...`

Add the browsing screen or dialog components needed for:

- server selection
- dataset list
- document list
- paragraph list

### `packages/opencode/src/cli/cmd/tui/context/sync.tsx`

Do not overload sync with deep MaxKB document/paragraph fetching by default.

Recommended behavior:

- continue syncing top-level MCP resource inventory only
- fetch MaxKB document and paragraph resources lazily when the `/kb` flow is active

## 9. Testing Strategy

### Unit tests

Add tests for:

- dataset payload schema parsing
- document payload schema parsing
- paragraph payload schema parsing
- parse failure behavior

### UI tests

Add focused TUI tests for:

- `/kb` entry flow
- dataset selection
- document selection
- paragraph rendering
- error states

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
2. A user can open a dedicated MaxKB browsing flow from the TUI.
3. Dataset, document, and paragraph payloads are parsed through Zod schemas.
4. Parse failures show explicit errors.
5. Users can drill down dataset → document → paragraph.
6. Browsing works against a real MaxKB MCP endpoint.
