# Embedded BMAD Implementation Plan

> Follow superpowers:test-driven-development for behavior changes. Do not commit before user validation.

**Goal:** Ship pinned BMAD skills and uv with WisCode, enabling project initialization through `/bmad-init` without user-side installation or platform selection.

**Architecture:** Vendor a pinned BMAD main snapshot plus a separately tracked local-update patch. A deterministic CLI initializer installs owned skills into `.agents/skills`, invokes upstream setup with bundled uv, and reports JSON. V1/V2 slash commands call it; desktop and standalone CLI distribute the same resources.

**Tech Stack:** Bun, TypeScript, Python setup.py, uv, Electron.

Vendor refresh: `bun script/update-bmad.ts --source /path/to/BMAD-METHOD --commit <40-char-SHA> --check` verifies the pinned snapshot without changing it. Omit `--check` to refresh from that commit and reapply `third_party/bmad/patches/local-update.patch`; run the upstream manifest validator and setup tests before accepting the refreshed files. The command never follows a floating branch at runtime.

### Task 1: Pin BMAD and local update behavior

**Files:** `third_party/bmad/`, `script/update-bmad.ts`, `packages/opencode/test/bmad/vendor.test.ts`.

1. Write a failing test that asserts the recorded commit, license, core manifests and local-update behavior.
2. Vendor the clean fixed commit. Preserve unmodified upstream files and a separate minimal patch for `setup.py`'s `file:` update suggestion.
3. Run the test and upstream manifest/setup tests.

### Task 2: Initialize projects safely

**Files:** `packages/opencode/src/bmad/init.ts`, `packages/opencode/test/bmad/init.test.ts`.

1. Write failing tests for first install, same-version/different-commit update, user edits, conflicts, interactive questions, repeat run, missing resources and uv errors.
2. Implement resource validation, module selection, owned-file sync to `.agents/skills`, temporary TOML answers, setup subprocess, structured results and a per-project lock.
3. Run `bun test test/bmad/init.test.ts` in `packages/opencode` after each behavior group.

### Task 3: Expose commands and skill discovery

**Files:** `packages/opencode/src/index.ts`, `packages/opencode/src/cli/cmd/bmad.ts`, `packages/opencode/src/command/index.ts`, `packages/core/src/plugin/command.ts`, `packages/core/src/config/plugin/skill.ts`, focused tests.

1. Write failing tests for V1/V2 command registration and V2 `.agents/skills` discovery.
2. Register the CLI bridge and `/bmad-init`; ensure interactive flow consumes JSON and no platform selection appears.
3. Verify command lists and skill discovery, including official CLI duplicate paths.

### Task 4: Bundle uv and BMAD on every supported target

**Files:** `packages/opencode/script/build.ts`, `packages/desktop/scripts/utils.ts`, `packages/desktop/electron-builder.config.ts`, `packages/desktop/src/main/server.ts`, `script/build-desktop-prod-mac.sh`, `script/build-desktop-prod-windows.ps1`, packaging tests.

1. Write failing resource-resolution and packaging tests.
2. Pin uv release archives with checksums; copy the matching executable, license and BMAD skills into CLI and desktop resources; prepend uv directory to sidecar/CLI PATH.
3. Build and inspect an available desktop artifact; document unverified platforms.

### Task 5: Verify and hand off

1. Run real BMAD setup in a temporary project for quick and interactive modes, then rerun after a simulated upgrade.
2. Run upstream validator/tests, focused Bun tests and package-local `bun typecheck`.
3. Check `git diff --check`, inspect scope, report outcomes and remaining platform risks. Leave all changes uncommitted.
