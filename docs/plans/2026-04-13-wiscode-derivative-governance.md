# WisCode Derivative Governance Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** Complete the high-priority isolation work required for WisCode to ship as a stable OpenCode-derived product without conflicting with upstream branding, config, update, or distribution paths.

**Architecture:** Keep core upstream structure intact, but isolate all user-facing product identity, local data/config paths, update endpoints, and distribution metadata. Treat Tauri desktop, Electron desktop, CLI install paths, and product web/API references as separate tracks so each can be completed and verified independently.

**Tech Stack:** Bun, TypeScript, Solid, Tauri, Electron, Rust, JSON/JSONC config, shell/PowerShell build scripts

### Task 1: Lock Tauri production updater to WisCode-owned release infrastructure

**Files:**
- Modify: `packages/desktop/src-tauri/tauri.prod.conf.json`
- Check: `script/build-desktop-prod-mac.sh`
- Check: `script/build-desktop-prod-windows.ps1`

**Step 1: Confirm current updater source**

Check `packages/desktop/src-tauri/tauri.prod.conf.json` and record the current `plugins.updater.endpoints` and `plugins.updater.pubkey`.

**Step 2: Decide WisCode release host**

Pick the real WisCode release endpoint source:
- GitHub Releases under your own repo, or
- a self-hosted update manifest endpoint.

Do not implement placeholder URLs unless the team explicitly accepts a temporary broken updater.

**Step 3: Update production Tauri config**

Change `plugins.updater.endpoints` to the WisCode-owned `latest.json` location. Keep `pubkey` aligned with the actual signing key used for those artifacts.

**Step 4: Verify packaging still produces updater artifacts**

Run:
```bash
./script/build-desktop-prod-mac.sh
```

Expected:
- build succeeds
- `WisCode.app.tar.gz`
- `WisCode.app.tar.gz.sig`
- generated updater metadata points to the WisCode release channel

**Step 5: Commit**

```bash
git add packages/desktop/src-tauri/tauri.prod.conf.json
git commit -m "fix: 切换 tauri 生产更新源到 wiscode"
```

### Task 2: Isolate desktop-installed CLI path from OpenCode

**Files:**
- Modify: `packages/desktop/src-tauri/src/cli.rs`
- Modify: `packages/desktop-electron/src/main/cli.ts`
- Check: `packages/opencode/bin/opencode`
- Check: uninstall/install related CLI docs or helpers if touched transitively

**Step 1: Write the failing expectations**

Add or update tests around CLI install path if coverage exists close to desktop install helpers. If no direct tests exist, add minimal coverage at the smallest practical layer.

Expected new behavior:
- desktop app installs CLI under `.wiscode/bin`
- installed binary name remains `wiscode`
- no new writes under `.opencode/bin`

**Step 2: Run the targeted test or reproduce manually**

Run the smallest package-scoped verification available. If no automated test exists, capture the manual install path before changing code.

**Step 3: Implement the path switch**

Update the desktop install constants from `.opencode/bin` to `.wiscode/bin` in both Tauri and Electron codepaths. Review any uninstall or sync logic that assumes the legacy directory.

**Step 4: Verify install behavior**

For Tauri/macOS, verify:
```bash
./script/build-desktop-prod-mac.sh
```

Then install the app and confirm the CLI lands under:
```bash
~/.wiscode/bin/wiscode
```

**Step 5: Commit**

```bash
git add packages/desktop/src-tauri/src/cli.rs packages/desktop-electron/src/main/cli.ts
git commit -m "fix: 隔离桌面安装的 cli 目录"
```

### Task 3: Decide and execute Electron strategy

**Files:**
- Modify: `packages/desktop-electron/electron-builder.config.ts`
- Modify: `packages/desktop-electron/src/main/index.ts`
- Modify: `packages/desktop-electron/src/main/migrate.ts`
- Check: `packages/desktop-electron/src/renderer/index.tsx`
- Check: `packages/desktop-electron/src/renderer/updater.ts`

**Step 1: Make the product decision**

Choose one path:
- maintain Electron as a supported WisCode desktop product
- freeze Electron and stop advertising/building it

Do not keep Electron half-renamed.

**Step 2A: If Electron stays supported**

Update:
- `appId` to `ai.wiscode.desktop[.channel]`
- `productName` to `WisCode[ Dev/Beta]`
- protocol `name` and `schemes` to WisCode values
- publish owner/repo/channel away from upstream OpenCode
- `artifactName` if you want public artifacts branded as WisCode
- `app.setName()` and `app.setPath("userData", ...)`
- deep link parsing from `opencode://` to `wiscode://`
- migration source IDs so old Tauri OpenCode/WisCode data migration is intentional and explicit

**Step 2B: If Electron is frozen**

Document it clearly and stop treating it as an active release path:
- remove it from operator docs/build guidance
- avoid partial branding edits that imply support

**Step 3: Verify packaging**

If supported, run from package dir:
```bash
bun run package:mac
```
or on Windows:
```powershell
bun run package:win
```

Expected:
- app identity, deep link, output name, and publish config no longer point at OpenCode

**Step 4: Commit**

```bash
git add packages/desktop-electron
git commit -m "fix: 对齐 electron 产物的 wiscode 标识"
```

### Task 4: Finish non-doc user-visible runtime copy cleanup

**Files:**
- Modify: `packages/opencode/src/cli/error.ts`
- Modify: `packages/opencode/src/cli/cmd/providers.ts`
- Check: `packages/opencode/src/cli/cmd/github.ts`
- Check: `packages/opencode/src/server/instance.ts`
- Check: `packages/opencode/test/branding/user-visible-copy.test.ts`

**Step 1: Expand copy audit**

Search for user-visible mentions of:
- `opencode.json`
- `.opencode`
- `opencode://`
- `OpenCode`

Ignore pure test fixture data and internal package names unless surfaced to end users.

**Step 2: Add regression coverage**

Extend branding/copy tests so common runtime messages cannot regress back to old naming.

**Step 3: Apply targeted replacements**

Update error/help text to prefer `wiscode.json` / `.wiscode` where WisCode is the intended user path, while keeping legacy compatibility only where technically necessary.

**Step 4: Verify**

Run from `packages/opencode`:
```bash
bun test test/branding/user-visible-copy.test.ts
```

**Step 5: Commit**

```bash
git add packages/opencode/src/cli/error.ts packages/opencode/src/cli/cmd/providers.ts packages/opencode/test/branding/user-visible-copy.test.ts
git commit -m "fix: 清理运行时用户可见的旧配置文案"
```

### Task 5: Externalize service endpoints and product URLs

**Files:**
- Modify: `packages/opencode/src/cli/cmd/github.ts`
- Modify: `packages/opencode/src/server/instance.ts`
- Modify: `packages/web/config.mjs`
- Check: any shared config/env helper already used for domains

**Step 1: Inventory real external dependencies**

List each upstream-bound endpoint currently hardcoded:
- API
- app web host
- share links
- release links
- docs/help URLs

**Step 2: Introduce a product-owned configuration surface**

Move these values behind one consistent config source:
- env vars for build/runtime, or
- a shared product config module.

Avoid scattering direct string replacement across multiple packages.

**Step 3: Set WisCode defaults**

If WisCode already has its own domains, set them as defaults. If not, document that the remaining OpenCode URLs are intentional temporary dependencies.

**Step 4: Verify**

Smoke-test:
- shared links
- auth/help navigation
- generated updater or release links if impacted

**Step 5: Commit**

```bash
git add packages/opencode/src/cli/cmd/github.ts packages/opencode/src/server/instance.ts packages/web/config.mjs
git commit -m "refactor: 抽离 wiscode 外部服务地址"
```

### Task 6: Rebrand the public web/docs/extension surface

**Files:**
- Modify: `packages/web/config.mjs`
- Modify: `packages/web/src/content/i18n/*`
- Modify: `packages/web/src/content/docs/**/*`
- Modify: `packages/extensions/zed/extension.toml`
- Check: screenshots, social card, share page labels

**Step 1: Split product-doc work from runtime work**

Do not batch this together with runtime isolation. Treat docs and extensions as a separate release lane.

**Step 2: Update primary public surfaces first**

Prioritize:
- homepage title/meta
- share page brand strings
- install docs
- config docs
- CLI command examples
- extension metadata

**Step 3: Preserve deliberate upstream references**

If any page intentionally documents upstream compatibility, keep it explicit instead of mechanically replacing names.

**Step 4: Verify**

Run the relevant package build commands and preview key pages manually.

**Step 5: Commit**

```bash
git add packages/web packages/extensions/zed/extension.toml
git commit -m "docs: 更新 wiscode 对外文档与扩展标识"
```

### Task 7: Add permanent derivative-regression guards

**Files:**
- Modify: `packages/opencode/test/branding/*`
- Modify: `packages/desktop-electron/src/renderer/i18n.test.ts`
- Create: `packages/desktop/test` or nearest appropriate package tests if missing

**Step 1: Add brand guardrails**

Cover:
- production bundle ID
- deep link scheme
- updater endpoint host
- CLI install directory
- user-facing product name

**Step 2: Keep tests narrow**

Assert only derivative-critical properties. Do not snapshot huge files.

**Step 3: Run package-scoped verification**

From the relevant package dirs:
```bash
bun test
```

**Step 4: Commit**

```bash
git add packages/opencode/test packages/desktop-electron/src/renderer/i18n.test.ts
git commit -m "test: 增加 wiscode 派生版本回归保护"
```

## Recommended execution order

1. Task 1: Tauri updater isolation
2. Task 2: Desktop CLI install path isolation
3. Task 3: Electron go/no-go decision
4. Task 4: Runtime copy cleanup
5. Task 5: External service URL abstraction
6. Task 6: Public docs/extension rebrand
7. Task 7: Regression guards

## Notes

- Internal workspace package names like `@opencode-ai/*` are intentionally deferred because they create large merge pain with upstream and do not block current WisCode shipping.
- Legacy compatibility with `opencode.json` and `.opencode` should remain read-compatible where migration or coexistence requires it, but new writes and new user guidance should prefer `wiscode.json` and `.wiscode`.
- Do not ship any updater-enabled production build until Task 1 is complete.
