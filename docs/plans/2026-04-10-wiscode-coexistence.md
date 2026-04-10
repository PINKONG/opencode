# WisCode Coexistence Implementation Plan

> **For Claude:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task.

**Goal:** 让 WisCode 与官方 OpenCode 在同一台机器上共存，默认使用独立的全局目录和项目配置名，同时保持对旧 `opencode` 配置的兼容读取。

**Architecture:** 先用测试锁定三类行为：全局状态目录与数据库文件名改为 `wiscode`、项目配置优先读取 `wiscode.json/.wiscode`、旧 `opencode.json/.opencode` 仍可回退读取。实现时只改配置发现和默认写入路径，不碰 provider id、包导入名、远端基础设施地址。

**Tech Stack:** Bun, TypeScript, Effect, Bun test

---

### Task 1: Lock coexistence behavior with tests

**Files:**
- Modify: `packages/opencode/test/storage/db.test.ts`
- Modify: `packages/opencode/test/config/config.test.ts`

**Step 1: Write the failing test**

为以下行为新增最小测试：
- 全局数据库默认文件名改为 `wiscode.db`
- 同目录下 `wiscode.json` 优先于 `opencode.json`
- `.wiscode` 目录配置优先于 `.opencode`
- 只有旧命名时仍能成功读取

**Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/storage/db.test.ts test/config/config.test.ts`
Expected: FAIL，失败原因是当前实现仍然生成 `opencode` 命名或未识别 `wiscode` 配置。

**Step 3: Write minimal implementation**

只修改配置发现、目录命名与默认文件名，不扩大范围。

**Step 4: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/storage/db.test.ts test/config/config.test.ts`
Expected: PASS

### Task 2: Switch default global state to wiscode

**Files:**
- Modify: `packages/opencode/src/global/index.ts`
- Modify: `packages/opencode/src/storage/db.ts`

**Step 1: Write the failing test**

使用 Task 1 中的数据库路径测试覆盖此行为。

**Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/storage/db.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

把全局 app 目录名改为 `wiscode`，数据库默认文件名改为 `wiscode*.db`，保留现有 `OPENCODE_*` 环境变量兼容。

**Step 4: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/storage/db.test.ts`
Expected: PASS

### Task 3: Prefer wiscode project config and keep fallback

**Files:**
- Modify: `packages/opencode/src/config/paths.ts`
- Modify: `packages/opencode/src/config/config.ts`

**Step 1: Write the failing test**

使用 Task 1 中的配置优先级测试覆盖此行为。

**Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/config/config.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

项目级查找顺序调整为：
- `wiscode.json`, `wiscode.jsonc`
- 回退 `opencode.json`, `opencode.jsonc`
- 目录优先 `.wiscode`
- 回退 `.opencode`

**Step 4: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/config/config.test.ts`
Expected: PASS

### Task 4: Default new writes and tips to wiscode names

**Files:**
- Modify: `packages/opencode/src/config/config.ts`
- Modify: `packages/opencode/src/cli/cmd/tui/feature-plugins/home/tips-view.tsx`
- Modify: `packages/opencode/src/command/template/initialize.txt`
- Modify: any directly related writer paths discovered during implementation

**Step 1: Write the failing test**

优先复用现有配置写入测试，必要时补一个“更新配置写入 `wiscode.json`”测试。

**Step 2: Run test to verify it fails**

Run: `cd packages/opencode && bun test test/config/config.test.ts`
Expected: FAIL

**Step 3: Write minimal implementation**

让新创建/新写入的配置默认落到 `wiscode` 命名，用户提示同步改为新命名，旧文件只读不主动写入。

**Step 4: Run test to verify it passes**

Run: `cd packages/opencode && bun test test/config/config.test.ts`
Expected: PASS

### Task 5: Verify and stabilize

**Files:**
- Verify only

**Step 1: Run focused tests**

Run: `cd packages/opencode && bun test test/storage/db.test.ts test/config/config.test.ts`
Expected: PASS

**Step 2: Run related branding/config regression tests**

Run: `cd packages/opencode && bun test test/branding/user-visible-copy.test.ts test/cli/tui/thread.test.ts`
Expected: PASS

**Step 3: Run typecheck**

Run: `cd packages/opencode && bun typecheck`
Expected: PASS
