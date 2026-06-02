# Bundled Ripgrep Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Bundle platform-specific ripgrep binaries into desktop installers and sync them into WisCode's cache bin at startup so skill loading works in offline environments.

**Architecture:** Reuse the existing desktop resource bundling pattern used for the CLI and bundled Node. Build-time scripts copy a vendored `rg` binary into `packages/desktop/resources`, electron-builder ships it, and desktop startup copies it into the cache bin path that `packages/opencode` already searches before attempting a GitHub download.

**Tech Stack:** Bun scripts, Electron main process, electron-builder, Bun tests.

### Task 1: Lock behavior with tests

**Files:**
- Modify: `packages/desktop/test/build-script.test.ts`
- Modify: `packages/desktop/test/electron-builder-config.test.ts`
- Modify: `packages/desktop/src/main/cli-install.test.ts`

**Step 1: Write failing tests**
Add expectations that desktop build scripts copy bundled `rg`, electron-builder ships `rg`, and desktop startup calls a `syncRipgrep()` path.

**Step 2: Run test to verify it fails**
Run: `cd packages/desktop && bun test ./test/build-script.test.ts ./test/electron-builder-config.test.ts ./src/main/cli-install.test.ts`
Expected: FAIL because `rg` is not mentioned yet.

### Task 2: Add build-time bundling for ripgrep

**Files:**
- Modify: `packages/desktop/scripts/utils.ts`
- Modify: `packages/desktop/scripts/prebuild.ts`
- Modify: `packages/desktop/scripts/predev.ts`
- Modify: `script/build-desktop-prod-mac.sh`
- Modify: `script/build-desktop-prod-windows.ps1`

**Step 1: Implement ripgrep helpers**
Add vendored archive resolution and copy helpers parallel to bundled Node handling, sourcing archives from `third_party/ripgrep/<version>/` with network fallback only for build environments.

**Step 2: Wire prebuild/predev and prod packaging scripts**
Ensure `resources/rg(.exe)` is generated before Electron packaging in dev and prod flows.

**Step 3: Re-run targeted tests**
Run: `cd packages/desktop && bun test ./test/build-script.test.ts`
Expected: PASS for script/resource assertions.

### Task 3: Sync ripgrep into cache bin on startup

**Files:**
- Modify: `packages/desktop/src/main/cli.ts`
- Modify: `packages/desktop/src/main/index.ts`

**Step 1: Add bundled ripgrep path resolution and sync function**
Implement `syncRipgrep()` that copies bundled `rg(.exe)` into the cache bin path used by `packages/opencode`, preserving executable/signing handling like the CLI flow where needed.

**Step 2: Call startup sync**
Invoke `syncRipgrep()` during packaged app startup alongside `syncCli()`.

**Step 3: Re-run targeted tests**
Run: `cd packages/desktop && bun test ./src/main/cli-install.test.ts ./test/electron-builder-config.test.ts`
Expected: PASS.

### Task 4: Verify end-to-end build-time correctness

**Files:**
- Modify if needed based on verification output

**Step 1: Run focused validation**
Run: `cd packages/desktop && bun test ./test/build-script.test.ts ./test/electron-builder-config.test.ts ./src/main/cli-install.test.ts`
Expected: PASS.

**Step 2: Run typecheck**
Run: `cd packages/desktop && bun typecheck`
Expected: PASS.

**Step 3: Commit**
`git add ... && git commit -m "fix(desktop): bundle ripgrep for offline skills"`
