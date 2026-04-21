# MaxKB Knowledge Web UI Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Build a directory-scoped Web knowledge browsing UI for MaxKB MCP so users can browse datasets, category-filtered documents, and paged document paragraphs from the existing app shell.

**Architecture:** Reuse the existing `packages/app` directory route shell, add a dedicated `/:dir/knowledge` route family, detect MaxKB availability per current directory through experimental MCP resource listing, and render a read-only browsing surface backed by the already validated `experimental.resource.read` and `experimental.tool.call` endpoints. Keep the Web page focused on browsing only; do not mix in answer-time retrieval, prompt injection, or MaxKB admin actions.

**Tech Stack:** TypeScript, Bun, Solid, Solid Router, TanStack Solid Query, Zod, existing `@opencode-ai/sdk/v2`, existing app shell/sidebar infrastructure, existing MaxKB experimental MCP endpoints.

## 1. Dependency

This plan depends on:

- [2026-04-20-maxkb-mcp-transport-integration-plan.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-20-maxkb-mcp-transport-integration-plan.md)
- [2026-04-20-maxkb-mcp-browsing-ui-plan.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-20-maxkb-mcp-browsing-ui-plan.md)

Do not implement this Web plan before:

- MaxKB transport support is merged
- TUI browsing flow is merged
- real MaxKB manual validation is already passing against the current MCP contract

## 2. Scope

### In scope

- Web-only knowledge base entry in the left rail above settings
- directory-scoped MaxKB availability detection
- dedicated knowledge routes under `/:dir`
- dataset list page
- dataset document page with left category tree
- document paragraph page with paging and client-side search/filter over loaded paragraph records
- loading, empty, unavailable, parse error, and request error states

### Out of scope

- Web-side answer-time retrieval integration
- upload, migrate, delete, settings, tag editing, or other MaxKB admin actions
- global cross-project knowledge browsing
- deep-linkable filter/query-string persistence beyond route params
- reusing `packages/opencode/src/mcp/*` directly inside `packages/app`

## 3. Product Decisions

### 3.1 Host surface

Implement this feature in `packages/app`, not `packages/web`.

Reason:

- the user-facing left rail and session shell live in `packages/app`
- the knowledge entry is part of the app shell, not the docs site
- the feature should live beside session routes inside the same directory-scoped workspace shell

### 3.2 Entry placement

Place the knowledge button in the left rail, above the settings button, inside:

- `packages/app/src/pages/layout/sidebar-shell.tsx`

The parent wiring stays in:

- `packages/app/src/pages/layout.tsx`

### 3.3 Shell strategy

Do not open the knowledge browser as a dialog.

Do not overload the session tab.

Use the existing app shell and replace only the main content region with a dedicated knowledge page when the user navigates into the knowledge route.

### 3.4 Route strategy

Use directory-scoped routes:

- `/:dir/knowledge`
- `/:dir/knowledge/:dataset`
- `/:dir/knowledge/:dataset/:document`

Why this route family is preferred:

1. it matches the existing directory-scoped app structure
2. page refresh keeps the current knowledge location
3. browser back/forward works naturally
4. dataset/document identity belongs in the URL more than in local component state

Paragraph identity stays out of the URL in phase one.

If a later phase needs shareable paragraph links, upgrade this to:

- `/:dir/knowledge/:dataset/:document/:paragraph?`

### 3.5 Visibility strategy

Only show the knowledge button when the current directory context detects at least one MaxKB-capable MCP server.

MaxKB-capable means:

- `experimental.resource.list()` for the current directory returns at least one resource item whose `uri` is `maxkb://datasets` or starts with `maxkb://datasets?`

This is a heuristic, but it matches the real MaxKB MCP behavior already used by TUI.

Resolved sidebar behavior:

- while availability is unresolved, do not render the button
- when availability resolves to usable MaxKB, render the button
- when availability resolves to unavailable or errors, keep the button hidden
- availability detection failure should still be observable through `console.warn` logging with the decoded directory and error message

This keeps the rail behavior aligned with the explicit product requirement that the button should only appear when the current context actually has a usable MaxKB MCP server.

## 4. Current Reality

Relevant code already present:

- `packages/app/src/app.tsx`
  - owns top-level routes
  - currently mounts `/:dir/session/:id?` under `DirectoryLayout`
- `packages/app/src/pages/directory-layout.tsx`
  - provides directory-scoped `SDKProvider` and `SyncProvider` for route children
- `packages/app/src/pages/layout.tsx`
  - renders the app shell and sidebar
  - is outside the directory child route tree, so it does not have direct access to directory-scoped `useSDK()` / `useSync()`
- `packages/app/src/pages/layout/sidebar-shell.tsx`
  - owns the bottom rail where settings currently lives
- `packages/app/src/context/global-sdk.tsx`
  - can create a client for an arbitrary directory
- `packages/opencode/src/server/instance/experimental.ts`
  - already exposes:
    - `GET /experimental/resource`
    - `POST /experimental/resource/read`
    - `POST /experimental/tool/call`
- `packages/opencode/src/mcp/maxkb-resource.ts`
  - already contains the parsing rules used by TUI
  - cannot be imported directly into `packages/app` because `@opencode-ai/app` does not depend on the `opencode` package source tree

Important implementation constraint:

The sidebar entry cannot rely on directory-scoped hooks like `useSDK()` or `useSync()` because `Layout` is mounted outside `DirectoryLayout`.

Therefore the sidebar availability check must:

1. read the current `:dir` from router params
2. decode it to a real directory
3. create a directory client through `useGlobalSDK().createClient({ directory, throwOnError: true })`
4. call `client.experimental.resource.list({ directory })`
5. cache the result in a small app-side hook

Recommended implementation detail:

- use TanStack Query with `queryKey: ["maxkb-availability", directory]`
- discard stale results automatically by directory key
- if a manual async path is used instead, explicitly guard against stale directory resolution before committing state

This must be explicit in implementation to avoid putting directory-only logic in the wrong provider layer.

## 5. Target UX

The Web UI should borrow the information architecture of MaxKB’s own knowledge pages, but not its admin actions.

### 5.1 Dataset page

Reference: MaxKB knowledge list page.

Render a dataset card grid with:

- dataset name
- description
- document count
- character count
- application mapping count
- optional creator/update metadata if available

Clicking a card navigates to `/:dir/knowledge/:dataset`.

### 5.2 Dataset document page

Reference: MaxKB document list page.

This page must include a left category tree and a right document list.

Left pane:

- search box for category name
- fixed virtual nodes:
  - `All documents`
  - `Uncategorized`
- recursive category tree from MaxKB category payload
- count badge per node

Right pane:

- dataset title and summary
- document search box
- paged document rows
- browser-only columns:
  - name
  - char length
  - paragraph count
  - active state
  - hit handling method
  - update time

The right pane is a browsing table/list, not a management toolbar.

### 5.3 Document paragraph page

Reference: MaxKB paragraph list page.

Render:

- document title
- document metadata summary
- paragraph search box
- paged paragraph card list or compact card grid

Each paragraph card should show:

- paragraph title or fallback label
- truncated content preview
- char count or content length summary
- active/status metadata

Do not render the full raw paragraph body in the list view.

Paragraph search on this page is client-side filtering over the currently loaded paragraph records.

Phase one does not add a server-side paragraph search API.

## 6. Data Contracts

Web should reuse the same payload semantics already validated in TUI, but with app-local schemas.

Do not import `packages/opencode/src/mcp/maxkb-resource.ts` from `packages/app`.

Instead, add a minimal app-local schema module containing only the browsing contracts used by Web.

Reason:

- `packages/app` depends on `sdk/ui/util`, not on `packages/opencode` source modules
- introducing a new shared package just for this feature would expand scope
- copying the smallest stable browsing schema is the lowest-risk phase-one choice

Drift policy:

- when the MaxKB MCP browsing contract changes, update both:
  - `packages/opencode/src/mcp/maxkb-resource.ts`
  - `packages/app/src/data/maxkb.ts`
- these updates should happen in the same commit
- if a third consumer appears, extract the shared schema/helpers in that same PR instead of copying again

### 6.1 App-local schema module

Create two Web-local data modules:

- `packages/app/src/data/maxkb.ts`
- `packages/app/src/data/knowledge-api.ts`

`packages/app/src/data/maxkb.ts` should export:

- `findMaxkbClients(resources)`
- `extractMaxkbResourceText(result)`
- `extractMaxkbToolText(result)`
- `parseMaxkbText(text, schema)`
- `MaxkbDatasetPayload`
- `MaxkbCategoryPayload`
- `MaxkbDocumentDetailPayload`
- `MaxkbDocumentPagePayload`
- `MaxkbParagraphPagePayload`

`packages/app/src/data/knowledge-api.ts` should export:

- `createKnowledgeApi(sdkClient, client)`

Schema rules:

- use the real TUI-validated field set
- require only the fields used by Web browsing
- keep `.passthrough()` on objects
- keep category recursion
- keep paragraph paging shape:
  - `page.limit`
  - `page.offset`
  - `page.total`
  - `page.has_more`
  - `page.records`

### 6.2 API usage

Datasets:

- `experimental.resource.read({ client, uri: "maxkb://datasets" })`

Categories:

- `experimental.resource.read({ client, uri: "maxkb://datasets/{dataset}/categories" })`

Document detail:

- `experimental.resource.read({ client, uri: "maxkb://datasets/{dataset}/documents/{document}" })`

Document page:

- `experimental.tool.call({ client, name: "list_dataset_documents", arguments: { dataset_id, category_id?, current_page, page_size, name? } })`

Paragraph page:

- `experimental.tool.call({ client, name: "get_document_paragraphs", arguments: { dataset_id, document_id, limit, offset } })`

Recommended thin wrapper in `packages/app/src/data/knowledge-api.ts`:

```ts
createKnowledgeApi(sdk, client).datasets()
createKnowledgeApi(sdk, client).categories(dataset)
createKnowledgeApi(sdk, client).documents({ dataset, category, page, size, name })
createKnowledgeApi(sdk, client).document(dataset, document)
createKnowledgeApi(sdk, client).paragraphs({ dataset, document, limit, offset })
```

Keep raw SDK argument shapes out of page components where possible.

## 7. State Boundaries

### 7.1 Route params

Use route params for stable page identity:

- `dir`
- `dataset`
- `document`

### 7.2 Local page state

Keep these local for now:

- selected MaxKB client when multiple are detected
- category selection sentinel
- category search text
- document search text
- current document page
- paragraph offset / loaded pages
- client-side “load more” accumulation state

Do not move these into query string in phase one.

Lifecycle rule:

- local state should survive navigation inside the knowledge route tree
- navigating from dataset page to document page and back should preserve the previously selected category and document search state
- navigating out of `/knowledge` resets this local browsing state

### 7.3 Sidebar availability state

Use a dedicated hook, for example:

- `useKnowledgeAvailability()`

It should own:

- loading
- unavailable
- available clients
- selected default client when exactly one exists
- fetch lifecycle tied to current decoded directory

This state belongs near the app shell, not inside the knowledge page only, because the left rail button needs it before navigation.

Failure rule:

- sidebar detection failure should not surface a broken rail button
- keep the button hidden on failure
- if the user manually navigates to `/knowledge`, the page itself should show an explicit availability/detection error state

Multi-client rule:

- switching the active MaxKB client must navigate back to `/:dir/knowledge`
- client switch clears dataset/document/paragraph route context and subordinate local state

## 8. Component Plan

### 8.1 Sidebar entry

Add a new left rail button component or inline block in:

- `packages/app/src/pages/layout/sidebar-shell.tsx`

Behavior:

- sits above settings
- hidden while unresolved
- hidden when no MaxKB server is available
- navigates to `/:dir/knowledge`
- shows active state when current route matches `/knowledge`

### 8.2 Knowledge route pages

Add a new page area:

- `packages/app/src/pages/knowledge/index.tsx`

This route component should render the shared page shell:

- header / breadcrumb area
- availability checks
- client picker when multiple MaxKB clients exist
- nested content switch for dataset / document / paragraph pages

Recommended subcomponents:

- `KnowledgeLayout`
- `KnowledgeDatasets`
- `KnowledgeDocuments`
- `KnowledgeParagraphs`
- `KnowledgeCategoryTree`
- `KnowledgeDocumentList`
- `KnowledgeParagraphList`

Exact filenames can vary, but keep them grouped under:

- `packages/app/src/pages/knowledge/`

### 8.3 Dataset page

Use a responsive card grid.

Each card:

- clickable entire surface
- title
- secondary description
- metadata row

### 8.4 Category tree

Use a simple recursive tree built from buttons/divs, not a generic file tree import.

Reason:

- category nodes need count badges and special virtual nodes
- file tree drag/drop and file semantics are irrelevant here
- a small dedicated recursive component is easier to control

The page layout should still use a familiar split-pane structure:

- fixed/resizable left pane
- flexible right pane

Reuse `ResizeHandle` for the split if that remains cheap; otherwise keep first version fixed width.

Recommended phase-one choice:

- fixed left pane width first
- only add `ResizeHandle` if implementation cost remains small after core browsing works

### 8.5 Document list

Render document rows in a bordered list/table-style panel.

Each row supports:

- click to open document paragraph page
- title
- metadata columns
- selected/hover styling

Add a footer or inline control for paging:

- `Load more`

Do not implement sortable admin-table behavior in phase one.

### 8.6 Paragraph list

Render compact cards, not a dense table.

Each card supports:

- readable title
- truncated excerpt
- secondary metadata

Add:

- search box
- `Load more` for paragraph pagination

The content preview must be truncated aggressively to avoid the same rendering bloat issue already found in TUI.

## 9. Error and Empty States

The Web UI must explicitly handle:

1. current directory has no MaxKB-capable MCP server
2. directory route is invalid or undecodable
3. `experimental.resource.list` fails during sidebar detection
4. resource read fails
5. tool call fails
6. invalid JSON text
7. schema parse failure
8. empty datasets
9. empty categories/documents/paragraphs

Do not collapse parse or request failures into empty panels.

Recommended copy tone:

- concise, operational, non-marketing
- mention whether the failure happened during server detection, resource read, or tool call

## 10. File-Level Change Plan

### `packages/app/src/app.tsx`

Add the knowledge route family under `/:dir`:

- `/:dir/knowledge`
- `/:dir/knowledge/:dataset`
- `/:dir/knowledge/:dataset/:document`

All should stay under `DirectoryLayout`.

### `packages/app/src/pages/layout.tsx`

Add routing awareness and sidebar wiring for the knowledge entry.

Possible changes:

- derive whether the current path is inside `/knowledge`
- pass new knowledge button props into `SidebarContent`
- create the directory-scoped availability probe using `useGlobalSDK`, router params, and decoded `dir`

### `packages/app/src/pages/layout/sidebar-shell.tsx`

Extend props to support:

- knowledge label
- knowledge active state
- knowledge loading state
- knowledge hidden/visible state
- knowledge click handler

Render the knowledge icon button above settings.

### `packages/app/src/pages/knowledge/index.tsx`

Create the main route component and shared shell.

Responsibilities:

- guard on decoded route params
- choose active MaxKB client
- show availability/error states
- render datasets/documents/paragraphs child views based on params

### `packages/app/src/pages/knowledge/*`

Create focused components for:

- `packages/app/src/pages/knowledge/index.tsx`
  - route entry and page switching
- `packages/app/src/pages/knowledge/layout.tsx`
  - shared shell, availability state, client picker
- `packages/app/src/pages/knowledge/datasets.tsx`
  - dataset grid
- `packages/app/src/pages/knowledge/documents.tsx`
  - document page shell with left tree and right list
  - owns category selection and document paging state
  - composes `category-tree.tsx` and `load-more.tsx`
- `packages/app/src/pages/knowledge/paragraphs.tsx`
  - paragraph page
- `packages/app/src/pages/knowledge/category-tree.tsx`
  - recursive category tree
- `packages/app/src/pages/knowledge/load-more.tsx`
  - shared paging trigger

Keep component responsibilities narrow.

### `packages/app/src/data/maxkb.ts`

Create app-local MaxKB helpers and schemas.

Include:

- URI helpers for categories/detail if helpful
- resource and tool text extraction
- JSON parse helper
- client detection helper from `experimental.resource.list` response
- browsing schemas

### `packages/app/src/data/knowledge-api.ts`

Create the thin SDK wrapper that translates page-level needs into:

- `experimental.resource.read`
- `experimental.tool.call`

### `packages/app/src/i18n/en.ts`

Add user-facing strings for:

- knowledge button
- page headers
- unavailable states
- empty states
- load more
- category virtual nodes

Update all existing app locale files in the same PR.

Use English fallback strings for non-primary locales if translation quality is not ready, but do not leave the new keys undefined.

### Tests

Add focused unit tests in `packages/app/src` for:

- MaxKB helper/schema parsing
- MaxKB client detection helper
- knowledge route/path helper logic if extracted

Do not start with full browser e2e coverage for phase one.

## 11. Testing Strategy

### Unit tests

Recommended test files:

- `packages/app/src/data/maxkb.test.ts`
- `packages/app/src/pages/knowledge/helpers.test.ts` if helper extraction justifies it

Cover:

- `maxkb://datasets` detection
- `maxkb://datasets?x=y` detection
- subpath rejection
- invalid JSON handling
- schema parse failures
- category virtual-node mapping
- paragraph preview truncation helper if extracted

### Integration-adjacent validation

Because this feature relies on real MCP connectivity, manual validation is required after unit coverage.

Manual flow:

1. connect a real MaxKB MCP server for the target directory
2. confirm the knowledge button appears above settings
3. open dataset list
4. open one dataset
5. verify left category tree renders
6. switch between `All documents`, `Uncategorized`, and one real category
7. search documents
8. open one document
9. load additional paragraph pages
10. confirm the button is hidden when the directory has no MaxKB server
11. switch directories quickly and confirm stale availability results do not leak across directories

### Type checking

Run from package directory only:

```bash
cd packages/app
bun typecheck
```

### Package tests

Run from package directory only:

```bash
cd packages/app
bun test --preload ./happydom.ts ./src
```

If targeted execution is preferred during development, run only the new test files first.

## 12. Acceptance Criteria

Implementation is complete when all of the following are true:

1. The Web app shows a knowledge button above settings only when the current directory detects a usable MaxKB MCP server.
2. Clicking the button navigates into a dedicated knowledge route family under `/:dir`.
3. The dataset page renders real MaxKB datasets from MCP.
4. The dataset document page renders a left category tree and right paged document list.
5. The document paragraph page renders document metadata plus paged paragraph previews.
6. Documents and paragraphs use the current MaxKB MCP contract through `experimental.tool.call`.
7. Resource/tool payloads are parsed through explicit app-local Zod schemas.
8. Invalid JSON, schema errors, request failures, and unavailable-server states render explicit UI feedback.
9. The implementation typechecks and package tests pass in `packages/app`.

## 13. Implementation Tasks

### Task 1: Add app-local MaxKB helpers and tests

**Files:**
- Create: `packages/app/src/data/maxkb.ts`
- Create: `packages/app/src/data/knowledge-api.ts`
- Test: `packages/app/src/data/maxkb.test.ts`

**Step 1: Write failing helper tests**

Cover:

- MaxKB client detection from resource inventory
- JSON extraction and parse failures
- dataset/category/document/paragraph schema parsing

**Step 2: Run test to verify failure**

Run:

```bash
cd packages/app
bun test --preload ./happydom.ts ./src/data/maxkb.test.ts
```

Expected:

- failing imports or missing helper functions

**Step 3: Write minimal implementation**

Add the helper/schema module with only the browsing fields Web needs.

Also add `packages/app/src/data/knowledge-api.ts` so page components do not inline raw `experimental.resource.read` / `experimental.tool.call` argument objects.

**Step 4: Run test to verify pass**

Run the same test command.

**Step 5: Commit**

```bash
git add packages/app/src/data/maxkb.ts packages/app/src/data/knowledge-api.ts packages/app/src/data/maxkb.test.ts
git commit -m "feat: add web maxkb data helpers"
```

### Task 2: Add knowledge availability hook

**Files:**
- Modify: `packages/app/src/pages/layout.tsx`
- Test pure helper logic if extracted under: `packages/app/src/pages/knowledge/helpers.test.ts`

**Step 1: Write failing helper test if availability logic is extracted**

Cover:

- MaxKB available
- MaxKB unavailable
- stale directory result ignored

**Step 2: Run targeted tests**

Run only the helper test file if created.

**Step 3: Write minimal implementation**

Add:

- directory decode from params
- `globalSDK.createClient({ directory })`
- `experimental.resource.list()` probe
- directory-keyed availability state

Use TanStack Query with:

- `queryKey: ["maxkb-availability", decodedDirectory]`

so directory switches isolate cache entries and stale results are discarded by Query's built-in keying.

**Step 4: Run typecheck**

```bash
cd packages/app
bun typecheck
```

**Step 5: Commit**

```bash
git add packages/app/src/pages/layout.tsx packages/app/src/pages/knowledge
git commit -m "feat: add knowledge availability detection"
```

### Task 3: Add knowledge routes and sidebar entry

**Files:**
- Modify: `packages/app/src/app.tsx`
- Create: `packages/app/src/pages/knowledge/index.tsx`
- Modify: `packages/app/src/pages/layout.tsx`
- Modify: `packages/app/src/pages/layout/sidebar-shell.tsx`

**Step 1: Write a small route-level test or helper test if route logic is extracted**

If route helper extraction is needed, test route matching or breadcrumb logic there.

**Step 2: Run test to verify failure**

Run the targeted app test command for the helper file if one exists.

**Step 3: Write minimal implementation**

Add:

- the three knowledge routes under `/:dir`
- a placeholder page component
- sidebar button wiring
- active route state
- navigation to `/:dir/knowledge`

**Step 4: Run typecheck**

```bash
cd packages/app
bun typecheck
```

Expected:

- route wiring typechecks

**Step 5: Commit**

```bash
git add packages/app/src/app.tsx packages/app/src/pages/knowledge/index.tsx packages/app/src/pages/layout.tsx packages/app/src/pages/layout/sidebar-shell.tsx
git commit -m "feat: add knowledge route entry"
```

### Task 4: Build dataset page

**Files:**
- Modify: `packages/app/src/pages/knowledge/index.tsx`
- Create or modify supporting files under: `packages/app/src/pages/knowledge/`

**Step 1: Write failing helper/component test if dataset mapping is extracted**

Prefer testing pure mapping logic over full component rendering first.

**Step 2: Run targeted tests**

Run only the new knowledge test file if present.

**Step 3: Write minimal implementation**

Implement:

- active client selection
- dataset fetch
- dataset grid
- loading/empty/error states

Use existing manual-validation payloads as smoke-shape fixtures if a light component/helper test helps keep the page grounded in real MaxKB responses.

**Step 4: Run package tests and typecheck**

```bash
cd packages/app
bun test --preload ./happydom.ts ./src
bun typecheck
```

**Step 5: Commit**

```bash
git add packages/app/src/pages/knowledge
git commit -m "feat: add knowledge dataset page"
```

### Task 5: Build category tree and category selection state

**Files:**
- Modify files under: `packages/app/src/pages/knowledge/`

**Step 1: Write failing tests for category shaping if extracted**

Cover:

- virtual nodes
- recursive category mapping
- filter behavior

**Step 2: Run targeted tests**

Run only the new helper test file.

**Step 3: Write minimal implementation**

Implement:

- category resource read
- left category tree
- category virtual nodes
- category search
- category selection persistence inside the knowledge route tree

**Step 4: Run package tests and typecheck**

```bash
cd packages/app
bun test --preload ./happydom.ts ./src
bun typecheck
```

**Step 5: Commit**

```bash
git add packages/app/src/pages/knowledge
git commit -m "feat: add knowledge category tree"
```

### Task 6: Build document list and split-pane document browser

**Files:**
- Modify files under: `packages/app/src/pages/knowledge/`

**Step 1: Write failing tests for document paging helpers if extracted**

Cover:

- page accumulation
- category-aware resets
- `Load more` visibility

**Step 2: Run targeted tests**

Run only the new helper test file.

**Step 3: Write minimal implementation**

Implement:

- document tool paging
- right document list
- document search
- `Load more`
- left/right pane composition

**Step 4: Run package tests and typecheck**

```bash
cd packages/app
bun test --preload ./happydom.ts ./src
bun typecheck
```

**Step 5: Commit**

```bash
git add packages/app/src/pages/knowledge
git commit -m "feat: add knowledge document browser"
```

### Task 7: Build document paragraph page

**Files:**
- Modify files under: `packages/app/src/pages/knowledge/`

**Step 1: Write failing tests for paragraph mapping/truncation if extracted**

**Step 2: Run targeted tests**

Run the paragraph helper test file if created.

**Step 3: Write minimal implementation**

Implement:

- document detail resource read
- paragraph tool paging
- paragraph search/filter
- paragraph card list
- explicit detail/read failure states

**Step 4: Run package tests and typecheck**

```bash
cd packages/app
bun test --preload ./happydom.ts ./src
bun typecheck
```

**Step 5: Commit**

```bash
git add packages/app/src/pages/knowledge
git commit -m "feat: add knowledge paragraph browser"
```

### Task 8: Manual validation against real MaxKB

**Files:**
- No required code changes

**Step 1: Run the app with a real MaxKB MCP directory config**

Verify:

- the button only appears in eligible directory context
- the route opens correctly

**Step 2: Validate the full browse flow**

Verify:

- datasets list
- category tree
- document paging
- paragraph paging

Before real-server validation, do one dry-run smoke against the existing manual-validation payload shapes to confirm the UI does not crash on real MaxKB JSON structure.

**Step 3: Validate negative paths**

Verify:

- no-MaxKB directory hides the button
- invalid MCP response shows error state

**Step 4: Commit only if this task required user-facing copy or polish changes**

If no code changed, do not create a no-op commit.

## 14. Open Follow-Ups

These are intentionally deferred:

- shareable query-string deep links for category/document paging
- resizable category pane
- richer paragraph preview or side drawer
- Web answer-time retrieval integration
- extracting shared MaxKB schema code into a reusable package when a third consumer appears
