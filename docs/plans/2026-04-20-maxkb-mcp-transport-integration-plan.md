# MaxKB MCP Transport Integration Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Add first-phase MaxKB MCP transport support to `opencode` so a remote MaxKB MCP server can be connected through the existing MCP client stack with correct MaxKB HMAC request signing.

**Architecture:** Reuse the existing `StreamableHTTPClientTransport` path and inject a MaxKB-aware signed `fetch` wrapper instead of introducing a parallel MaxKB client. Keep session handling, `initialize`, and normal MCP behavior inside the MCP SDK. Scope this phase to transport, authentication, protocol validation, and resource-read readiness. Browsing UI is intentionally split into a dependent follow-up phase.

**Tech Stack:** TypeScript, Bun, Effect, Zod, `@modelcontextprotocol/sdk@1.27.1`, existing `opencode` MCP config and runtime.

## 1. Scope

### In scope

- typed remote MCP config for MaxKB HMAC auth
- per-request HMAC signing for MaxKB `streamable-http`
- exact-path signing behavior, including `/mcp/` vs `/mcp`
- preservation of SDK-managed `mcp-session-id`
- explicit incompatibility handling with OAuth and SSE fallback
- unit and transport-level tests for signing and header behavior
- manual validation checklist for real MaxKB connection and `resources/read`
- operator documentation for configuring MaxKB in `opencode`

### Out of scope

- dataset/document/paragraph browsing UI
- TUI command or panel design
- MCP tool integration for answer grounding
- generalized HMAC framework for arbitrary remote MCP providers
- secure credential vaulting beyond current config-based approach

## 2. External Protocol Reality

This plan is based on:

- `/Volumes/EXTENSION/works/morewis/MaxKB/docs/maxkb-mcp-integration-deployment-guide.md`
- `/Volumes/EXTENSION/works/morewis/MaxKB/docs/plans/2026-04-17-maxkb-mcp-agent-integration-design.md`

Current MaxKB production assumptions:

- transport: `streamable-http`
- recommended endpoint path: `/mcp/`
- auth headers:
  - `X-MCP-App-Key`
  - `X-MCP-Timestamp`
  - `X-MCP-Nonce`
  - `X-MCP-Signature`
- signature algorithm:
  - `hex(HMAC_SHA256(app_secret, canonical_string))`
- canonical string:

```text
{METHOD}
{PATH}
{RAW_QUERY_STRING}
{BODY_SHA256_HEX}
{TIMESTAMP}
{NONCE}
```

MaxKB-specific runtime rules that matter on the client:

1. Every HTTP request must be signed independently.
2. `timestamp` and `nonce` must be freshly generated for every request.
3. The signed `PATH` must exactly match the real request path.
4. The server returns `mcp-session-id` after `initialize`.
5. Later requests must continue using the same session id.
6. `resources/read` and `tools/call` return primary business payloads as JSON text inside MCP content wrappers.

## 3. Current `opencode` Reality

Relevant files:

- `packages/opencode/src/config/config.ts`
  - remote MCP config currently supports static `headers`
- `packages/opencode/src/mcp/index.ts`
  - builds remote transports
  - currently tries `StreamableHTTPClientTransport` and then `SSEClientTransport`
  - may wire `McpOAuthProvider`
- `packages/opencode/src/mcp/auth.ts`
  - stores OAuth-related auth state
- `packages/opencode/src/server/instance/experimental.ts`
  - exposes MCP resource inventory

Important SDK fact:

- `StreamableHTTPClientTransport` already supports:
  - custom `fetch`
  - automatic capture and reuse of `mcp-session-id`

This means we do not need custom session management logic. The missing capability is only request signing.

## 4. Problem Statement

Static headers are insufficient for MaxKB.

Current config supports:

```ts
headers: z.record(z.string(), z.string()).optional()
```

That fails for MaxKB because:

1. `X-MCP-Timestamp` must change every request.
2. `X-MCP-Nonce` must change every request.
3. `X-MCP-Signature` depends on request-specific method, path, query, and body.
4. Signing must occur at send time, after the final request is known.

Therefore the integration boundary must be:

- config describes MaxKB auth intent
- transport injects a MaxKB-specific dynamic `fetch`
- MCP SDK remains the source of truth for protocol/session behavior

## 5. Design Decision

### Recommended config shape

```json
{
  "mcp": {
    "maxkb": {
      "type": "remote",
      "url": "http://127.0.0.1:8081/mcp/",
      "auth": {
        "type": "maxkb-hmac",
        "appKey": "mcp_xxx",
        "appSecret": "ms_xxx"
      }
    }
  }
}
```

Rationale:

1. MaxKB behavior stays explicit.
2. We avoid misusing static `headers`.
3. We do not fork the MCP client architecture.
4. This cleanly separates MaxKB auth from OAuth-oriented remote servers.

### Rejected alternatives

#### A. Put MaxKB values into static `headers`

Rejected because it cannot produce correct `timestamp`, `nonce`, or `signature`.

#### B. Add a reverse proxy that signs requests

Rejected because it adds another moving part and avoids solving the real client-side integration problem.

#### C. Build a separate MaxKB-specific client

Rejected because it duplicates transport logic and moves us away from current MCP abstractions.

## 6. Signed Fetch Design

### 6.1 Responsibility

The signed fetch wrapper is responsible for:

1. resolving the actual outgoing request
2. extracting exact method, path, query, and body bytes
3. generating fresh auth headers
4. preserving all SDK-managed headers and semantics
5. delegating the final request to the underlying `fetch`

### 6.2 Input normalization rules

The fetch wrapper must handle `fetch(input, init)` where `input` may be:

- `Request`
- `URL`
- `string`

#### Case A: `input` is `Request`

Rules:

1. Read request body using `await input.clone().arrayBuffer()`.
2. Use the cloned bytes for hashing and later request reconstruction.
3. Resolve method, URL, and headers from the original request as the base request.
4. Rebuild a new `Request` after adding signed headers.
5. For `GET` and `HEAD`, do not pass a body when rebuilding the request.
6. For all other methods, explicitly pass the cloned bytes as the rebuilt request body.

Reason:

- request bodies are stream-backed and may be single-consumption
- signing must not consume the real body before the underlying fetch sees it
- some runtimes reject `GET` or `HEAD` requests if a body is present during `Request` construction

#### Case B: `input` is `string` or `URL`

Rules:

1. Resolve final URL from `input`.
2. Resolve method from `init.method ?? "GET"`.
3. Resolve body bytes from `init.body`.
4. Supported `init.body` types in Phase 1:
   - `string`
   - `Uint8Array`
   - `ArrayBuffer`
   - `undefined`
5. Explicitly reject `ReadableStream` bodies by throwing.

Reason:

- MCP SDK does not currently need streaming request bodies here
- rejecting unsupported body types is safer than silently signing the wrong bytes

### 6.3 URL extraction rules

Canonical signing must use the final resolved URL, not the original configured MCP base URL.

Required extraction:

- `path = url.pathname`
- `rawQuery = url.search.replace(/^\?/, "")`

Do not:

- infer path from `mcp.url`
- normalize slashes
- trim trailing slash

`/mcp/` and `/mcp` are distinct signing inputs and must stay distinct.

### 6.4 Header merge rules

Header merge policy:

- start from SDK-provided headers
- preserve all existing headers unchanged
- only `set`:
  - `X-MCP-App-Key`
  - `X-MCP-Timestamp`
  - `X-MCP-Nonce`
  - `X-MCP-Signature`

This means the wrapper must preserve headers such as:

- `mcp-session-id`
- `content-type`
- `accept`
- `mcp-protocol-version`

The signed fetch must not replace the header set wholesale.

Use `Headers.set` with the documented MaxKB casing for:

- `X-MCP-App-Key`
- `X-MCP-Timestamp`
- `X-MCP-Nonce`
- `X-MCP-Signature`

Rely on the `Headers` API for case-insensitive deduplication of existing keys.

### 6.5 Nonce rule

Phase 1 nonce format:

- 16 random bytes
- hex encoded
- 32 characters total

Reason:

- simple
- cryptographically strong enough
- easy to test and debug

### 6.6 Error logging rule

For signed fetch diagnostics:

- only on `4xx` responses:
  - call `response.clone()`
  - read `await clone.text()`
  - attempt to extract `error_code` and `request_id`
- do not clone or read bodies on `2xx`

This keeps normal requests cheap while improving auth debugging.

Never log:

- `appSecret`
- raw signature
- full signed canonical string in normal logs

## 7. OAuth And Transport Selection Rules

### 7.1 OAuth mutual exclusion

`auth.type = "maxkb-hmac"` must be mutually exclusive with remote OAuth behavior.

Schema requirement:

- when `auth.type === "maxkb-hmac"`, `oauth` must be `false` or absent

Runtime requirement in `connectRemote`:

- if `auth.type === "maxkb-hmac"`, do not construct `McpOAuthProvider`

Reason:

- HMAC and OAuth authentication paths should not compete for the same transport lifecycle

### 7.2 SSE disablement

For normal remote MCP entries, current code tries:

1. `StreamableHTTPClientTransport`
2. `SSEClientTransport`

For `maxkb-hmac`, we should construct the transport candidates without SSE fallback.

Implementation direction:

- build the `transports` array conditionally
- when `auth?.type === "maxkb-hmac"`, only include `StreamableHTTP`

Reason:

- MaxKB is designed for `streamable-http`
- SSE fallback produces unnecessary requests, audit noise, and nonce consumption

## 8. File-Level Change Plan

### `packages/opencode/src/config/config.ts`

Add typed remote auth support.

Recommended additions:

- `McpRemoteAuthMaxkbHmac`
- remote config `auth` union
- schema refinement that rejects:
  - `auth.type = "maxkb-hmac"` together with `oauth !== false`

Also ensure the updated schema continues to surface through config typing and user-facing JSON schema generation.

Implementation note:

- prefer `superRefine` for the MaxKB/OAuth mutual exclusion check so the rule is enforced reliably for the remote config object in Zod v4

### `packages/opencode/src/mcp/maxkb.ts`

Create a MaxKB-specific signing helper.

Recommended responsibilities:

- body byte normalization
- sha256 hashing
- canonical string construction
- HMAC signing
- nonce generation
- signed fetch wrapper construction

Recommended exported units:

- `body(input): Uint8Array`
- `canonical(input): string`
- `sign(input): string`
- `createFetch(input): FetchLike`

The exact names can differ, but the module should stay transport-focused and MaxKB-specific.

### `packages/opencode/src/mcp/index.ts`

Modify remote transport creation.

Required behavior:

- detect `auth.type === "maxkb-hmac"`
- skip OAuth provider construction
- build a MaxKB signed fetch
- pass it to `StreamableHTTPClientTransport`
- construct transport candidates without SSE fallback for MaxKB
- preserve existing behavior for non-MaxKB remote servers

### `packages/web/src/content/docs/mcp-servers.mdx`

Add MaxKB-specific remote MCP configuration guidance:

- config example
- static headers are not enough
- `/mcp/` path exactness
- credentials should live in user-level config, not project config

## 9. Security Notes

1. `appSecret` is a credential and must not be committed to the repository.
2. Phase 1 should assume `appSecret` lives in user-level config, not project-level config.
3. The signed fetch must never log secret material.
4. The helper must not normalize away path distinctions like `/mcp/` vs `/mcp`.
5. Unsupported streaming bodies must fail loudly rather than produce invalid signatures.
6. `McpAuth.Service` can be evaluated later for better storage, but it is not required for Phase 1 transport support.

## 10. Testing Strategy

### 10.1 Unit tests

Target:

- `packages/opencode/test/mcp/`

Required coverage:

1. canonical string uses uppercase method
2. canonical string preserves exact path
3. canonical string preserves raw query string
4. empty body hashes to SHA256 of empty bytes
5. `Uint8Array` body hashes correctly
6. `string` body hashes correctly
7. unsupported `ReadableStream` body throws
8. nonce format is 32 hex chars
9. two nonce generations differ
10. fixture coverage for both:
   - `/mcp/`
   - `/mcp`
11. signed fetch preserves:
   - `mcp-session-id`
   - `content-type`
   - `mcp-protocol-version`
12. signed fetch only adds the four `X-MCP-*` headers

### 10.2 Transport tests

Recommended coverage:

1. remote config with `maxkb-hmac` produces signed outgoing requests
2. successive requests receive different nonce/timestamp values
3. `maxkb-hmac` does not create SSE fallback transport
4. `maxkb-hmac` does not construct OAuth provider
5. `mcp-session-id` survives later requests after `initialize`

### 10.3 Manual validation

Real MaxKB validation is a manual checklist, not a `bun test` task.

Required manual validation:

1. connect to a real MaxKB endpoint
2. verify `resources/list`
3. verify `readResource("maxkb://datasets")`
4. parse returned JSON text successfully
5. confirm auth failures surface useful logs without leaking secrets

Observed validation notes from the real MaxKB environment used during Phase 1:

1. requests must include `accept: application/json, text/event-stream`
2. JSON-RPC success responses for `initialize` and `resources/*` arrived as `text/event-stream`
3. `initialize` returned `mcp-session-id` and later requests succeeded when that session id was replayed
4. `notifications/initialized` returned `202` with an empty body
5. `resources/list` exposed the stable root resource `maxkb://datasets`
6. `resources/read` returned business payload JSON inside `result.contents[0].text`
7. real MCP envelopes and parsed payload fixtures are stored under `docs/plans/maxkb-manual-validation/`

## 11. Implementation Tasks

### Task 1: Add MaxKB auth config schema

**Files:**
- Modify: `packages/opencode/src/config/config.ts`
- Test: `packages/opencode/test/cli/mcp-config.test.ts`

**Step 1: Write the failing test**

Add config parse tests that accept:

```json
{
  "mcp": {
    "maxkb": {
      "type": "remote",
      "url": "http://127.0.0.1:8081/mcp/",
      "auth": {
        "type": "maxkb-hmac",
        "appKey": "mcp_test",
        "appSecret": "ms_test"
      }
    }
  }
}
```

Also add invalid cases:

- missing `appKey`
- missing `appSecret`
- `auth.type = "maxkb-hmac"` with `oauth: {}`
- `auth.type = "maxkb-hmac"` with `oauth` omitted, because current runtime behavior treats omitted `oauth` as OAuth-enabled by default

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode/packages/opencode
bun test test/cli/mcp-config.test.ts
```

Expected:

- parse failures for unsupported `auth`

**Step 3: Write minimal implementation**

Add the auth schema and enforce OAuth mutual exclusion.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode/packages/opencode
bun test test/cli/mcp-config.test.ts
```

Expected:

- config schema tests pass

**Step 5: Commit**

```bash
git add packages/opencode/src/config/config.ts packages/opencode/test/cli/mcp-config.test.ts
git commit -m "feat: add maxkb mcp auth config"
```

### Task 2: Add MaxKB signing helper

**Files:**
- Create: `packages/opencode/src/mcp/maxkb.ts`
- Test: `packages/opencode/test/mcp/maxkb-signing.test.ts`

**Step 1: Write the failing test**

Add tests for:

- canonical string generation
- body hashing from:
  - `string`
  - `Uint8Array`
  - `ArrayBuffer`
- `ReadableStream` rejection
- `/mcp/` vs `/mcp` fixture difference
- nonce format and uniqueness
- header merge behavior preserving:
  - `mcp-session-id`
  - `content-type`
  - `mcp-protocol-version`

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode/packages/opencode
bun test test/mcp/maxkb-signing.test.ts
```

Expected:

- module not found or failing assertions

**Step 3: Write minimal implementation**

Implement MaxKB helper functions and signed fetch creation.

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode/packages/opencode
bun test test/mcp/maxkb-signing.test.ts
```

Expected:

- signing tests pass

**Step 5: Commit**

```bash
git add packages/opencode/src/mcp/maxkb.ts packages/opencode/test/mcp/maxkb-signing.test.ts
git commit -m "feat: add maxkb request signing helper"
```

### Task 3: Wire signed fetch into remote MCP transport

**Files:**
- Modify: `packages/opencode/src/mcp/index.ts`
- Test: `packages/opencode/test/mcp/lifecycle.test.ts`
- Test: `packages/opencode/test/mcp/headers.test.ts`

**Step 1: Write the failing test**

Add transport tests that verify:

- MaxKB auth headers are attached on each request
- successive requests use different nonce/timestamp values
- `mcp-session-id` survives after initialize
- SSE fallback is not present for MaxKB
- OAuth provider is not constructed for MaxKB

**Step 2: Run test to verify it fails**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode/packages/opencode
bun test test/mcp/lifecycle.test.ts test/mcp/headers.test.ts
```

Expected:

- missing MaxKB auth behavior

**Step 3: Write minimal implementation**

Update remote transport creation to:

- detect `maxkb-hmac`
- build the transports array without SSE
- avoid OAuth provider construction
- inject signed fetch into `StreamableHTTPClientTransport`

**Step 4: Run test to verify it passes**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode/packages/opencode
bun test test/mcp/lifecycle.test.ts test/mcp/headers.test.ts
```

Expected:

- transport tests pass

**Step 5: Commit**

```bash
git add packages/opencode/src/mcp/index.ts packages/opencode/test/mcp/lifecycle.test.ts packages/opencode/test/mcp/headers.test.ts
git commit -m "feat: support maxkb remote mcp transport"
```

### Task 4: Add operator documentation

**Files:**
- Modify: `packages/web/src/content/docs/mcp-servers.mdx`

**Step 1: Write the failing doc expectation**

Document:

- MaxKB config example
- credentials belong in user-level config
- static headers are insufficient
- exact `/mcp/` path caveat

**Step 2: Verify documentation gap**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode
rg -n "MaxKB|maxkb|maxkb-hmac" packages/web/src/content/docs packages/opencode/src
```

Expected:

- no MaxKB-specific docs yet

**Step 3: Write minimal documentation**

Add a concise MaxKB remote MCP section.

**Step 4: Verify docs changed as expected**

Run:

```bash
cd /Volumes/EXTENSION/works/morewis/opencode
rg -n "MaxKB|maxkb-hmac|/mcp/" packages/web/src/content/docs
```

Expected:

- MaxKB docs are present

**Step 5: Commit**

```bash
git add packages/web/src/content/docs/mcp-servers.mdx
git commit -m "docs: add maxkb remote mcp guide"
```

### Task 5: Manual validation against real MaxKB

**Files:**
- Reference: this document
- Fixture output: `docs/plans/maxkb-manual-validation/`

**Step 1: Prepare a real config**

Create a user-level MCP config entry using a real MaxKB endpoint and credential.

**Step 2: Connect and validate**

Check:

1. MCP status shows connected
2. `resources/list` succeeds
3. `readResource("maxkb://datasets")` succeeds
4. returned payload is parseable JSON text
5. request headers include `accept: application/json, text/event-stream`

**Step 3: Validate failure diagnostics**

Intentionally break one auth input:

- wrong secret
- wrong path
- reused nonce

Expected:

- request fails
- logs contain useful HTTP/auth context
- logs do not contain secret material

**Step 4: Record results**

Save observed endpoint behavior and any deviations from the MaxKB deployment guide.

Recorded Phase 1 results:

1. `initialize` to `http://127.0.0.1:8081/mcp/` succeeded with HTTP `200`, `content-type: text/event-stream`, and returned `mcp-session-id`
2. `notifications/initialized` succeeded with HTTP `202` and an empty body
3. `resources/list` succeeded and returned one root resource: `maxkb://datasets`
4. `resources/read` for `maxkb://datasets` succeeded and the parsed payload contained `datasets` plus `truncated`
5. `resources/read` for `maxkb://datasets/{dataset_id}/documents` succeeded and the parsed payload contained `dataset`, `documents`, and `truncated`
6. `resources/read` for `maxkb://datasets/{dataset_id}/documents/{document_id}/paragraphs` succeeded and the parsed payload contained `dataset`, `document`, `paragraphs`, and `truncated`
7. envelope fixtures were saved as:
   - `docs/plans/maxkb-manual-validation/01-initialize-response.json`
   - `docs/plans/maxkb-manual-validation/02-initialized-response.json`
   - `docs/plans/maxkb-manual-validation/03-resources-list-response.json`
   - `docs/plans/maxkb-manual-validation/04-datasets-read-response.json`
   - `docs/plans/maxkb-manual-validation/06-documents-read-response.json`
   - `docs/plans/maxkb-manual-validation/08-paragraphs-read-response.json`
8. parsed payload fixtures were saved as:
   - `docs/plans/maxkb-manual-validation/05-datasets-payload.json`
   - `docs/plans/maxkb-manual-validation/07-documents-payload.json`
   - `docs/plans/maxkb-manual-validation/09-paragraphs-payload.json`
9. an intentionally invalid secret produced HTTP `401` with body `{"code":"MCP_AUTH_INVALID_SIGNATURE","message":"invalid signature"}`
10. the signed fetch diagnostic log included `status`, `method`, `path`, and `errorCode`, and did not include `appSecret`, nonce, or signature material

**Step 5: Commit**

No commit required unless code or docs changed during validation.

## 12. Acceptance Criteria

Implementation is complete when all of the following are true:

1. A remote MCP entry can be configured for MaxKB with typed config.
2. `auth.type = "maxkb-hmac"` is mutually exclusive with OAuth.
3. Every request to MaxKB is signed with fresh `timestamp`, `nonce`, and `signature`.
4. For MaxKB entries, transport creation uses `StreamableHTTP` without SSE fallback and does not construct `McpOAuthProvider`.
5. MCP SDK session handling continues to work without custom session management code.
6. `resources/list` and `readResource("maxkb://datasets")` pass in the manual validation checklist.
7. The codebase has tests covering signing logic, header preservation, and transport behavior.
8. Documentation exists for MaxKB configuration and troubleshooting.
