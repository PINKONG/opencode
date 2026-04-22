# MaxKB QA Retrieval Integration Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Integrate MaxKB answer-time retrieval into the session prompt flow so WisCode can answer user questions with MaxKB knowledge when a usable MaxKB MCP server is connected.

**Architecture:** Reuse the existing server-side MCP tool injection path in `packages/opencode/src/session/prompt.ts` instead of building a separate Web-only retrieval pipeline. Keep browsing UI and answer-time retrieval separate: browsing stays on `experimental.resource.read` and `experimental.tool.call`, while answer-time retrieval runs through the existing server-side `mcp.tools()` path with curated exposure and prompt guidance.

**Tech Stack:** TypeScript, Bun, Effect, Zod, existing MCP client lifecycle, existing session prompt/tool execution path, existing MaxKB MCP transport, existing WisCode session prompt files.

## 1. Dependency

This plan depends on:

- [2026-04-20-maxkb-mcp-transport-integration-plan.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-20-maxkb-mcp-transport-integration-plan.md)
- [2026-04-20-maxkb-mcp-browsing-ui-plan.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-20-maxkb-mcp-browsing-ui-plan.md)
- [2026-04-21-maxkb-knowledge-web-ui-plan.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-21-maxkb-knowledge-web-ui-plan.md)

Do not start implementation before:

- Phase 1 transport is merged and stable
- TUI and Web browsing flow have already passed manual validation
- real MaxKB production validation is available for `search_knowledge` and `search_dataset`

## 2. Scope

### In scope

- exposing MaxKB retrieval tools to the session prompt flow
- adding retrieval-oriented prompt guidance so the model knows when to use MaxKB
- validating and integrating `search_knowledge`
- validating and integrating `search_dataset`
- ensuring retrieval only participates when a connected MaxKB MCP server exists
- curating which MaxKB MCP tools are model-visible in session prompt
- tests for prompt exposure, tool execution path, and routing policy

### Out of scope

- changing the existing TUI or Web browsing UI
- adding a separate Web-side chat retrieval pipeline
- building a custom retrieval index outside MaxKB
- introducing dataset pinning UI in Phase 2
- changing non-MaxKB MCP behavior unless required for the curated exposure layer

## 3. Current Reality

Important facts from the current codebase:

- `packages/opencode/src/session/prompt.ts` already injects all connected MCP tools into the model tool list through `yield* mcp.tools()`
- `packages/opencode/src/mcp/index.ts` already converts connected MCP tool definitions into executable `Tool` objects with timeout and `resetTimeoutOnProgress`
- `packages/opencode/src/server/instance/experimental.ts` only whitelists:
  - `list_dataset_documents`
  - `get_document_paragraphs`
- `packages/sdk/js/src/v2/gen/*` therefore only knows those two names today
- `packages/app/src/data/knowledge-api.ts` also only knows those two browsing tools

This leads to one critical design distinction:

1. **Session prompt integration does not require `experimental/tool/call`**
   `session/prompt.ts` uses the server-side MCP service directly, not the experimental REST route.
2. **Expanding `/experimental/tool/call` is optional parity work**
   It is only needed if browser-side or SDK-side code must invoke `search_knowledge` or `search_dataset`.

This matters because the main Phase 2 implementation must target the session prompt path first, not the experimental route.

## 4. Product Decisions

### 4.1 Retrieval should be automatic but scoped

Use `toolChoice: auto` as it already exists today.

Do not force MaxKB retrieval on every user turn.

Instead, teach the model to use MaxKB only when the user is asking for:

- enterprise knowledge base content
- product documentation
- internal standards
- internal process descriptions
- internal solution design summaries
- knowledge that is likely outside the current repo but inside connected MaxKB datasets

Do not encourage MaxKB retrieval for:

- local codebase questions
- file edits
- shell commands
- git history
- build failures
- runtime debugging
- questions fully answerable from current workspace state

### 4.2 Model-visible MaxKB tools should be curated

Do not expose all four MaxKB browsing tools to the model by default.

For Phase 2, the model-visible MaxKB tools should be:

- `search_knowledge`
- `search_dataset`

Do not expose these browsing tools to the model in the session prompt:

- `list_dataset_documents`
- `get_document_paragraphs`

Reason:

- they are UI-oriented browse tools, not answer-time retrieval tools
- they are page-based and can confuse tool selection
- they increase the chance the model browses records instead of retrieving relevant knowledge
- they are already available through TUI/Web browsing surfaces and do not need to be duplicated in model reasoning

Implementation note:

- this curation can be done in `packages/opencode/src/session/prompt.ts`
- a lightweight first version can filter on sanitized tool key suffix:
  - `_search_dataset`
  - `_search_knowledge`
  - while skipping `_list_dataset_documents` and `_get_document_paragraphs`

This suffix-based policy is acceptable for Phase 2 because the MaxKB tool names are stable and already part of the transport integration contract.

### 4.3 Multi-client behavior should remain simple

If multiple MaxKB MCP clients are connected:

- expose retrieval tools from all connected MaxKB clients
- keep the existing sanitized tool key prefix by client name
- let the model choose the right client via tool descriptions and prior tool results

Do not build a session-level “selected knowledge client” memory layer in Phase 2.

The initial retrieval loop should instead rely on:

- client-prefixed tool names
- tool descriptions
- conversation history containing prior tool results

### 4.4 Retrieval flow recommendation

Recommended sequence for ambiguous knowledge-base questions:

1. If the relevant dataset is unclear and multiple datasets may matter, call `search_knowledge`
2. Use its result to identify the candidate dataset when the returned hits cluster around one dataset
3. If a follow-up needs to stay inside that one dataset, call `search_dataset`
4. Answer the user with citations or explicit attribution when the tool output supports it

Recommended sequence for obvious single-dataset questions:

1. Call `search_dataset` directly
2. Answer from the returned knowledge

This is now aligned with the production contract validation:

- `search_knowledge` works without `dataset_id` and therefore covers cross-dataset retrieval
- `search_dataset` requires `dataset_id` and therefore is only valid once the target dataset is already known

## 5. Required Validation Before Coding

`search_knowledge` and `search_dataset` were contract-validated against the
production MaxKB MCP on April 22, 2026.

Validated findings:

- `tools/list` exposes both tools with explicit JSON schema
- `search_dataset` requires `dataset_id` and `query_text`
- `search_knowledge` requires `query_text` and accepts optional `dataset_ids`
- both tools return JSON text in `result.content[0].text`
- both tools set `result.isError` for business validation failures
- successful responses currently share the same payload shape:
  - `results[]`
  - `search_scope`
- in the April 22, 2026 production validation, omitting `dataset_ids` from
  `search_knowledge` returned the same dataset-scoped results because the
  credential currently exposes one dataset; treat that as an observed runtime
  fact, not a guaranteed contract
- prompt guidance should therefore treat omitted `dataset_ids` as “search across
  all datasets currently authorized for this credential”, not “search the same
  single dataset forever”

Before touching prompt integration, keep these fixtures available from the
production MaxKB MCP:

- `tools/list` confirms both tool names
- `tools/call search_dataset` input shape
- `tools/call search_dataset` output shape
- `tools/call search_knowledge` input shape
- `tools/call search_knowledge` output shape
- `tools/call search_dataset` unauthorized dataset error shape
- whether outputs arrive in `content[0].text` as JSON string like the browsing tools
- whether `isError: true` is used for business errors

Capture examples under:

- `docs/plans/maxkb-manual-validation/`

If the tool results do not match the browsing-tool envelope, update this plan before implementation.

## 6. Prompt Strategy

The prompt change should be small and explicit.

Add a short section to the WisCode session/system prompt family stating:

- when a connected MaxKB knowledge base is available, use MaxKB retrieval tools for enterprise knowledge questions
- prefer `search_knowledge` when the relevant dataset is unclear
- prefer `search_dataset` only when a dataset is obvious or already identified
- do not use MaxKB retrieval for repo-local engineering tasks unless the user is clearly asking about knowledge-base content

Do not add long MaxKB product documentation into the prompt.

The model only needs:

- when to use the tools
- what each tool is for
- what not to use them for

Any tool-specific operational detail should live in tool descriptions, not the main system prompt.

## 7. Tool Description Strategy

Because `mcp.tools()` currently forwards MCP tool definitions almost verbatim, add a MaxKB-specific description augmentation layer when these two tools are exposed.

Desired description shape:

- `search_knowledge`
  - “Search across all authorized MaxKB knowledge bases for passages relevant to the user’s question”
- `search_dataset`
  - “Search within one specific MaxKB knowledge base dataset (requires dataset_id)”

Also add a short usage note:

- use only for knowledge-base questions
- avoid for local repo/code editing questions

This can be implemented in one of two places:

1. preferred: augment in `session/prompt.ts` when selecting model-visible MaxKB tools
2. fallback: augment in `mcp/index.ts` while converting tool definitions

Recommendation: do it in `session/prompt.ts` so Phase 2 remains scoped to answer-time retrieval behavior rather than globally rewriting MCP tool descriptions for every consumer.

## 8. Experimental Route Decision

Phase 2 answer-time retrieval does **not** require `/experimental/tool/call` expansion.

However, there are two valid options:

### Option A. Server-side only for now

Do not change:

- `packages/opencode/src/server/instance/experimental.ts`
- `packages/sdk/js/src/v2/gen/*`
- `packages/app/src/data/knowledge-api.ts`

Use only the server-side prompt integration path.

This is the recommended Phase 2 MVP because it keeps the change set small and directly targets the feature goal.

### Option B. Expand experimental parity too

Also whitelist:

- `search_dataset`
- `search_knowledge`

Then regenerate the SDK.

Do this only if one of these is needed immediately:

- browser-side debugging
- future Web chat-side retrieval tooling
- manual SDK-based validation through the app

Recommendation: start with Option A, defer Option B unless implementation reveals a strong need.

## 9. Files Likely To Change

### Required

- Modify: `packages/opencode/src/session/prompt.ts`
  - curate model-visible MaxKB tools
  - add tool description augmentation
  - implement the curation inside the existing `for (const [key, item] of Object.entries(yield* mcp.tools()))` loop so:
    - only MaxKB tool keys ending in `_search_knowledge` or `_search_dataset` remain model-visible
    - MaxKB browse tools ending in `_list_dataset_documents` or `_get_document_paragraphs` are skipped
    - the surviving retrieval tools have augmented descriptions before they are assigned into `tools[key]`
- Modify: `packages/opencode/src/session/prompt/*.txt`
  - add concise MaxKB retrieval guidance to relevant prompt files
- Add/Modify: `packages/opencode/test/session/prompt-effect.test.ts`
  - validate model-visible tool exposure and retrieval call behavior

### Optional parity work

- Modify: `packages/opencode/src/server/instance/experimental.ts`
  - expand `ToolCallBody` enum
- Modify: `packages/sdk/js/src/v2/gen/types.gen.ts`
- Modify: `packages/sdk/js/src/v2/gen/sdk.gen.ts`
- Modify: `packages/app/src/data/knowledge-api.ts`
  - only if the experimental route is expanded for parity

### Manual validation artifacts

- Add or update: `docs/plans/maxkb-manual-validation/*`

## 10. Testing Matrix

### Unit and integration-adjacent

1. no MaxKB client connected
   - no MaxKB retrieval tools added to the session tool list
2. MaxKB client connected with four tools
   - only `search_dataset` and `search_knowledge` become model-visible
3. browse tools remain hidden from the model
   - `list_dataset_documents`
   - `get_document_paragraphs`
4. tool descriptions are augmented for retrieval intent
5. tool execution path still passes through MCP correctly
6. `isError: true` from retrieval tools becomes user-visible tool error output

### Prompt behavior

1. a knowledge-base question can trigger MaxKB retrieval
2. a repo-local code question does not trigger MaxKB retrieval
3. an ambiguous “哪个知识库里有这个内容” question can trigger cross-dataset `search_knowledge` first

### Manual validation

1. connect only built-in `maxkb-prod`
2. ask a question clearly answered by the industrial knowledge base
3. confirm the model calls a MaxKB retrieval tool
4. confirm the final answer uses tool output rather than hallucinated content
5. ask a normal coding question in the same repo
6. confirm MaxKB retrieval is not called

## 11. Implementation Tasks

### Task 0: Validate production contracts

**Files:**
- Add/Modify: `docs/plans/maxkb-manual-validation/*`

Steps:

1. Call `search_dataset` against production MaxKB
2. Record request/response shape
3. Call `search_knowledge` against production MaxKB
4. Record request/response shape
5. Confirm validation error envelope semantics
6. Confirm unauthorized dataset error envelope semantics

Do not proceed to code if the envelopes differ materially from the assumptions in this plan.

### Task 1: Write failing tests for MaxKB retrieval tool exposure

**Files:**
- Modify: `packages/opencode/test/session/prompt-effect.test.ts`

Steps:

1. add a failing test showing connected MaxKB tools include only retrieval tools in prompt exposure
2. run the focused test and confirm failure
3. implement minimal curation in `packages/opencode/src/session/prompt.ts`
4. rerun the focused test and confirm pass
5. commit

### Task 2: Add prompt guidance

**Files:**
- Modify: `packages/opencode/src/session/prompt/*.txt`
- Test: `packages/opencode/test/session/prompt-branding.test.ts` or a new prompt text test if needed

Steps:

1. add concise MaxKB retrieval guidance to the relevant prompt files
2. add a failing assertion that the retrieval guidance is present
3. run the focused prompt test and confirm failure
4. rerun and confirm pass
5. commit

### Task 3: Validate execution path and error handling

**Files:**
- Modify: `packages/opencode/test/session/prompt-effect.test.ts`

Steps:

1. add a failing test where a MaxKB retrieval tool returns tool output
2. add a failing test where the retrieval tool returns `isError: true`
3. implement only the missing output/error shaping needed by the prompt path
4. rerun focused tests
5. commit

### Task 4: Optional experimental parity

**Files:**
- Modify: `packages/opencode/src/server/instance/experimental.ts`
- Regenerate: `packages/sdk/js/src/v2/gen/types.gen.ts`
- Regenerate: `packages/sdk/js/src/v2/gen/sdk.gen.ts`
- Modify: `packages/app/src/data/knowledge-api.ts` if needed
- Test: `packages/opencode/test/server/experimental-tool-call.test.ts`

Steps:

1. add failing route tests for `search_dataset` and `search_knowledge`
2. expand the whitelist
3. regenerate SDK
4. rerun focused server tests
5. commit

Skip this task in the first implementation pass unless parity is explicitly required.

#### Task 4 status memo

Task 4 is intentionally skipped for the Phase 2 MVP.

Reason:

- the Phase 2 goal is session answer-time retrieval, and that path is fully
  served by `session/prompt.ts` through server-side `mcp.tools()`
- Web/App browsing already uses the Phase 1 experimental browse route
- Web/App does not currently call `search_knowledge` or `search_dataset`
  directly
- expanding `/experimental/tool/call` plus regenerating the SDK would add
  maintenance diff without user-facing benefit in the current product scope

Revisit Task 4 only when Web/App needs direct retrieval calls, for example a
future Web chat-side knowledge-base QA entry point or SDK-based retrieval
debugging flow.

## 12. Risks

### Risk 1. Unknown tool input/output contract

Mitigation:

- validate production first
- do not guess field names in prompt integration code

### Risk 2. Model over-calls MaxKB retrieval

Mitigation:

- keep prompt guidance narrow
- hide browse tools
- test “normal coding question does not call MaxKB”

### Risk 3. Multiple connected MaxKB clients confuse tool choice

Mitigation:

- keep client-prefixed tool names
- make tool descriptions explicit
- accept this limitation in Phase 2 MVP

## 13. Recommendation

Start Phase 2 now, but in this order:

1. production validation of `search_dataset` and `search_knowledge`
2. session prompt curation and prompt guidance
3. prompt-effect tests
4. optional experimental route parity only if still needed

This keeps the first retrieval slice small, testable, and aligned with the actual feature goal.
