# BMAD Slash Commands Implementation Plan (Historical)

> Superseded: BMAD skills are no longer exposed as ordinary slash commands. Keep this document only as the implementation record for the removed compatibility bridge.

The current behavior is documented in `docs/wiscode-fork-delta.md` and `docs/wiscode-upstream-merge-checklist.md`.

> Use the reviewed design in `2026-10-11-bmad-slash-commands-design.md`. Do not commit before manual verification.

**Goal:** Expose discovered BMAD skills as executable slash commands in CLI and V2/Web, with correct precedence and same-session refresh.

**Architecture:** Keep skills as the single content source. V1 refreshes its per-project skill and command caches; V2 derives command views from live skills and admits expanded commands through SessionV2. A project manifest fingerprint bridges independent `wiscode bmad init` writes to running servers.

**Stack:** Bun, Effect, TypeScript, Solid, Protocol/Client generation.

## Tasks

1. **V1 refresh spike:** Add a failing test with an already-running V1 Layer, install a BMAD skill, invalidate only its project skill/command states, and prove `list/get` sees the skill without rebuilding the Layer. Run the focused test from `packages/opencode`. If this cannot work, stop and revisit the reviewed fallback before editing other paths.
2. **V1 CLI:** Add failing tests for `/` completion, `/skills`, `/bmad-help`, name precedence, and same-session refresh. Implement only the BMAD filter exception and project-scoped invalidation. Keep non-BMAD behavior unchanged.
3. **V2 skill/command:** Add failing core tests for empty-then-installed source, project-over-global resolution, name collisions, description normalization, and `bmad-help`. Make SkillV2 reload invalidate file caches, and make CommandV2 list/get derive BMAD commands from current skills. Run core focused tests and typecheck.
4. **V2 execution:** Add failing Protocol/Server tests for command execution, missing/denied skill, arguments, attachments, and durable prompt admission. Add a Session command endpoint that resolves current command server-side and delegates to `SessionV2.prompt` without V1 orchestration. Regenerate Client from `packages/client` and run typechecks.
5. **Web and refresh:** Add failing app tests for V1 source mapping, V2 command submit, both composers, and reload on slash open/after init. Wire the V2 endpoint through the compatibility layer. Add manifest byte-fingerprint invalidation with `stat` fast path and strong refresh points; test same-metadata replacement and cross-project isolation.
6. **Verification:** Run package-level focused tests and `bun typecheck`; smoke CLI plus Web command execution. Report macOS/Windows manual build gaps for the user's validation. Leave changes uncommitted.

## Current verification

- V1 same-layer refresh, CLI completion, V2 command derivation, HTTP admission/permissions/attachments/agent/model, project isolation, and manifest invalidation have focused passing tests.
- Relevant package typechecks and the Web production build pass. macOS interactive browser and packaged desktop checks passed in manual verification; Windows remains outstanding.
- App tests require `--conditions=solid --preload ./happydom.ts`. The submit test mock now provides the `toaster` export expected by the app, and its command-submit test directly covers `/bmad-agent-analyst` with arguments, agent, and model. `bootstrap.test.ts` also passes under the package's prescribed test conditions.
- Run `submit.test.ts` separately from `bootstrap.test.ts`: their existing global `mock.module` setup contaminates a combined Bun test process (`loadMcpQuery` export error). Their isolated runs pass; a combined app suite is not claimed green.
- Windows build and runtime validation remain outstanding after this commit.
