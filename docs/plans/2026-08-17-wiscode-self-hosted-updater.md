# WisCode Self-Hosted Updater Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Replace the GitHub-backed desktop updater with the public MoreCloud WisCode update service and verify an upgrade from test version 1.4.17 to published version 1.4.18.

**Architecture:** Keep electron-updater and its existing controller/UI lifecycle. Configure a generic provider at runtime with a platform- and architecture-specific MoreCloud directory, letting electron-updater request its conventional metadata filename. Production and beta builds map to separate service channels; development builds keep updates disabled.

**Tech Stack:** Electron, electron-updater, TypeScript, Bun test, electron-builder.

### Task 1: Define the self-hosted feed mapping

**Files:**
- Create: `packages/desktop/src/main/updater-feed.ts`
- Test: `packages/desktop/src/main/updater-feed.test.ts`

1. Test mappings for Windows, macOS, and Linux across x64 and arm64.
2. Test rejection of unsupported platforms and architectures.
3. Run `bun test src/main/updater-feed.test.ts` from `packages/desktop` and confirm the new cases fail before implementation.
4. Implement the minimal validated URL mapping.
5. Re-run the focused test and confirm it passes.

### Task 2: Configure electron-updater

**Files:**
- Modify: `packages/desktop/src/main/updater.ts`
- Modify: `packages/desktop/electron-builder.config.ts`
- Test: `packages/desktop/electron-builder.config.test.ts`

1. Update builder configuration tests to require the MoreCloud generic provider for prod and beta.
2. Run the focused tests and confirm failure against the GitHub configuration.
3. Configure runtime feed URLs from the build channel and current platform/architecture.
4. Disable downgrade while retaining the existing manual download/install lifecycle.
5. Run updater controller, feed, and builder configuration tests.

### Task 3: Prepare the downgrade-free upgrade fixture

**Files:**
- Modify: `packages/opencode/package.json`
- Modify: `packages/desktop/package.json`
- Modify: `bun.lock`

1. Set the local test client and sidecar version to `1.4.17` without reverting code.
2. Refresh the lockfile workspace versions.
3. Verify the desktop prepare/build path preserves `1.4.17` when `OPENCODE_VERSION=1.4.17`.

### Task 4: Verify the client integration

**Files:**
- Verify all files above.

1. Run focused updater tests from `packages/desktop`.
2. Run `bun typecheck` from `packages/desktop`.
3. Run the desktop production build from `packages/desktop`.
4. Confirm the live prod Windows and macOS metadata endpoints return version `1.4.18`.
5. Build and install a signed `1.4.17` package for the host platform, then confirm detection, download, restart, and installed version `1.4.18`.
