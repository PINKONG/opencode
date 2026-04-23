# 桌面版内嵌 Node 支持本地 MCP（`node xxx.js`）设计

## 1. 目标与背景

### 1.1 目标

让桌面版用户在**未安装系统 Node**的情况下，也能直接使用公司内部已有的本地 MCP（配置形如 `type: "local", command: ["node", "xxx.js"]`）。

### 1.2 业务动机

- 公司内部分发用户里有大量非开发者，无法稳定维护本机 Node
- 内部已有 MCP 以 Node 脚本形式存在，短期不适合全部改造成二进制或 remote
- 目标是“安装桌面包即可用”，不要求用户额外配置运行时

### 1.3 成功标准

- 新装桌面版后，在无系统 Node 条件下，`node xxx.js` 型本地 MCP 可连通
- 不修改用户全局 PATH、不写系统环境变量
- 用户配置保持不变，不需要写内置 Node 绝对路径

## 2. 范围与边界

### 2.1 In Scope

- Tauri 与 Electron 桌面包内置 Node `24.14.0`
- 本地 MCP 启动路径优先使用内置 Node
- 运行时可回退系统 Node
- 仅在 MCP 子进程作用域注入环境

### 2.2 Out of Scope

- `npx`/`npm`/`pnpm` 命令链路（本期不内置 npm CLI）
- WSL 内部缺 Node 的修复（见 8.4）
- CLI（npm 全局安装）分发模式调整

> 结论：本期保障 `command[0] = node` 以及 shebang `#!/usr/bin/env node`（通过 PATH 前置）两类场景；`npx` 不在覆盖范围。

## 3. 方案对比与选型

### 方案 A（采用）：显式替换 + PATH 前置 + 回退

- 对 `node` 命令做显式替换（优先内置 Node）
- 同时在 MCP 子进程作用域前置 PATH（支持 shebang `env node`）
- 内置 Node 不可用时回退系统 Node

### 方案 B：只做 PATH 前置

- 对 `node` 显式可观测性和可控性较差
- 平台差异调试成本更高

### 方案 C：要求用户写绝对路径

- 破坏零配置目标，不采用

## 4. 关键设计（已决）

### 4.1 Node 版本（已决）

- 固定：`Node 24.14.0`
- 平台矩阵：macOS arm64/x64、Windows arm64/x64、Linux arm64/x64
- 使用**官方 release 二进制**，不做 ICU/inspector 裁剪

### 4.2 环境变量命名（已决）

统一前缀为 `WISCODE_BUNDLED_NODE_*`：

- `WISCODE_BUNDLED_NODE_PATH`：内置 Node 绝对路径
- `WISCODE_BUNDLED_NODE_DISABLE=1`：禁用内置 Node 注入（运行时止血开关）

### 4.3 本地 MCP 命令解析规则（已决）

在 `packages/opencode/src/mcp/index.ts` 的 `connectLocal` 路径：

1. 读取 `mcp.command`
2. 若 `WISCODE_BUNDLED_NODE_DISABLE=1`，直接走系统逻辑，不注入
3. 预检 `WISCODE_BUNDLED_NODE_PATH`：
   - 文件存在
   - 可执行（`X_OK`）
4. 若 `command[0]` 为 `node`/`node.exe` 且预检通过：
   - 替换为内置 Node 绝对路径
5. 若预检通过：
   - MCP 子进程 PATH 前置 `dirname(WISCODE_BUNDLED_NODE_PATH)`（只对子进程）
6. 继续通过 `StdioClientTransport` 启动

### 4.4 回退与失败规则（已决）

- **仅预检失败时**回退系统 Node（warn 记录）
- **spawn 失败不重试系统 Node**
  - 避免连接时延翻倍
  - 避免掩盖内置 Node 真实失败原因

## 5. 可观测性设计（必须落代码）

在 MCP 服务日志里新增一次解析日志：

- `node_resolution: bundled | system | shebang | none`
- `bundled_node_path`
- `mcp_server_name`

建议日志形态：

- `log.info("local mcp node resolution", { mcp_server_name, node_resolution, bundled_node_path })`

## 6. 打包与运行时集成

### 6.1 Tauri

改动点：

- `packages/desktop/src-tauri/tauri*.conf.json`
  - `externalBin` 增加 `sidecars/wiscode-node`
- `packages/desktop/scripts/utils.ts`
  - 增加 node sidecar 映射
- `packages/desktop/scripts/prepare.ts` / `predev.ts`
  - 复制 node sidecar 到 `src-tauri/sidecars`
- `packages/desktop/src-tauri/src/cli.rs`
  - server 启动时注入 `WISCODE_BUNDLED_NODE_PATH`

### 6.2 Electron

改动点：

- `packages/desktop-electron/scripts/utils.ts`
  - 复制 `wiscode-node` 到 `resources`
- `packages/desktop-electron/scripts/prebuild.ts` / `predev.ts`
  - 拉取并放置 node 产物
- `packages/desktop-electron/src/main/server.ts`
  - `prepareServerEnv` 注入 `WISCODE_BUNDLED_NODE_PATH`
- `packages/desktop-electron/electron-builder.config.ts`
  - 确认资源打包覆盖 node sidecar

## 7. 体积评估与维护策略

### 7.1 体积量级（单平台包）

- 下载包增量：约 `+30 ~ +45 MB`
- 安装后磁盘占用：约 `+100 ~ +130 MB`

### 7.2 维护策略

- Node 安全更新随桌面发布节奏推进
- 每次升级执行完整回归矩阵（见 10）

## 8. 兼容性边界

### 8.1 兼容旧配置

- `["node", "script.js"]` 无需修改

### 8.2 shebang 支持

- `["./script"]` + `#!/usr/bin/env node` 可通过 PATH 前置命中内置 Node

### 8.3 npx 明确不覆盖

- `["npx", ...]` 本期仍依赖系统 Node/npm

### 8.4 WSL 限制

- Windows + WSL 路径下，命令在 WSL 内执行
- 本期不把 Windows 内置 Node 跨边界注入 WSL
- WSL 场景仍依赖 WSL 自身 Node

## 9. 实施前置 Task 0（新增，必须）

### Task 0: 现网配置分布调研

目标：确认方案覆盖率，避免 `npx` 占比过高导致方案价值缩水。

Owner：

- owner: `TBD`（发布负责人指定）
- deadline: `Task 1a 开始前`

执行：

- 收集公司分发版默认配置 + 至少 5 个内部团队 `wiscode.json`
- 统计本地 MCP `command[0]` 分布：`node` / `npx` / `python` / `bun` / 二进制
- 输出比例结论并提交到本文档 §9（commit 记录）

门槛：

- 若 `npx` 占比 > 30%，需在实施前提交补充方案（是否追加 npm CLI 打包或引导迁移）

## 10. 测试矩阵

### 10.1 `packages/opencode` 单测

纯函数建议返回结构：

```ts
type Resolution = {
  command: string[]
  env: Record<string, string>
  resolution: "bundled" | "system" | "shebang" | "none"
}
```

新增纯函数测试覆盖：

- `node` + 内置路径有效 -> bundled
- `node` + 内置路径不存在/不可执行 -> system
- `python` -> none（不替换）
- `WISCODE_BUNDLED_NODE_DISABLE=1` -> system（断言：`command[0]` 未替换且 PATH 未前置）
- PATH 前置逻辑（仅子进程 env）

### 10.2 桌面层测试

- Tauri/Electron server 启动环境包含 `WISCODE_BUNDLED_NODE_PATH`
- 打包脚本产物含 `wiscode-node` sidecar

### 10.3 手工验证（每平台）

1. 无系统 Node，`node xxx.js` 本地 MCP 可连通
2. 内置 Node 缺失时，系统 Node 可回退
3. 内置 + 系统 Node 都缺失时错误可读
4. shebang 脚本可连通
5. 非 node 命令不受影响
6. 远程 MCP 不受影响
7. Windows WSL 行为符合限制预期

## 11. 风险与回滚

### 11.1 风险

- 包体积增长
- macOS 签名/公证链路对新增二进制敏感
- Node 安全更新需要持续维护

### 11.2 回滚

- 运行时快速止血：`WISCODE_BUNDLED_NODE_DISABLE=1`
- 功能层回退无需改用户配置
- 发布层回退可移除 `wiscode-node` sidecar

## 12. macOS 公证专项 Spike（新增，必须）

在正式实施前先做一次独立验证：

1. 新增 `wiscode-node` sidecar 后是否能完整签名/公证通过
2. 是否需要重签 sidecar，重签后能否正常执行
3. Gatekeeper 下子进程 spawn 是否通过

若 Spike 失败，先阻断实施，不进入主分支开发。

### 12.1 Spike 结论（2026-04-23）

- 结论：`wiscode-node` 必须显式纳入 Electron 打包资源清单，并确保最终进入 app bundle 后参与签名/公证链路。
- 已落地：
  - `packages/desktop-electron/electron-builder.config.ts` 的 `extraResources` 明确包含：
    - `wiscode-cli` / `wiscode-cli.exe`
    - `wiscode-node` / `wiscode-node.exe`
  - `packages/desktop-electron/scripts/utils.ts` 在 dev 构建阶段对 `resources/wiscode-node` 做 ad-hoc `codesign`，保证本地调试可执行。
- 风险边界：
  - dev 的 ad-hoc 签名不等价于发布签名。
  - prod 仍需通过 CI 发布流程做最终签名与 notarization 验证（Gatekeeper 手工 smoke 必做）。
- 合并策略：
  - dev/beta 可先合并并验证功能。
  - prod 发布以 CI notarization 通过为门禁。

### 12.2 手工校验建议（发布前）

1. 构建 `package:mac` 产物后，确认 `.app/Contents/Resources/wiscode-node` 存在。
2. 运行 `codesign --verify --deep --strict <App>.app`。
3. 运行 `spctl -a -vvv <App>.app`，确认 Gatekeeper 评估通过。
4. 启动应用并连接 `command: ["node", "..."]` MCP，确认子进程可启动。

## 13. 实施任务拆分（更新）

### Task 1a: 本地命令解析纯函数

- 新增：`packages/opencode/src/mcp/local-command.ts`
- 新增：对应单测文件
- 内容：解析 `node` 替换、PATH 前置、disable flag、预检逻辑

### Task 1b: 接入 connectLocal + 日志

- 修改：`packages/opencode/src/mcp/index.ts`
- 接入 `local-command.ts`
- 增加 `node_resolution` 日志

### Task 2: Tauri 打包与环境注入

- 修改：
  - `packages/desktop/src-tauri/tauri*.conf.json`
  - `packages/desktop/scripts/utils.ts`
  - `packages/desktop/scripts/prepare.ts`
  - `packages/desktop/scripts/predev.ts`
  - `packages/desktop/src-tauri/src/cli.rs`
- 测试：
  - 覆盖 §10.2（server 环境变量注入 + sidecar 产物断言）

### Task 3: Electron 打包与环境注入

- 修改：
  - `packages/desktop-electron/scripts/utils.ts`
  - `packages/desktop-electron/scripts/prebuild.ts`
  - `packages/desktop-electron/scripts/predev.ts`
  - `packages/desktop-electron/src/main/server.ts`
  - 视情况修改 `packages/desktop-electron/electron-builder.config.ts`
- 测试：
  - 覆盖 §10.2（server 环境变量注入 + sidecar 产物断言）

## 14. 二进制入仓维护策略（新增）

由于决定将 Node 发行包入仓，需固定维护 SOP 以控制仓库膨胀风险。

### 14.1 目录约定

- 统一目录：`third_party/node/v<version>/`
- 仅存官方压缩包，不提交解压目录。
- 平台集合固定 6 个：
  - `darwin-arm64`
  - `darwin-x64`
  - `win-arm64`
  - `win-x64`
  - `linux-arm64`
  - `linux-x64`

### 14.2 升级步骤

1. 新建目录 `third_party/node/v<new-version>/` 并放置 6 个包。
2. 更新 `packages/desktop/scripts/utils.ts` 与 `packages/desktop-electron/scripts/utils.ts` 中 `NODE_VERSION`。
3. 运行桌面两端脚本验证：
   - `ensureBundledNodeBinary()` 能从 `third_party` 拷贝并解压。
4. 运行测试矩阵（§10）与 typecheck。
5. 合并后在下一版本窗口评估是否删除旧版本目录。

### 14.3 清理策略

- 默认保留最近 1 个历史版本用于回滚。
- 当发布线确认稳定后，删除更老版本目录，避免历史持续膨胀。

### Task 4: 文档与发布

- 更新内部发布说明：
  - 本期覆盖 `node`/shebang，不覆盖 `npx`
  - runtime disable 开关
  - WSL 限制
  - Node `24.14.0` 升级策略

## 15. 后续优化跟踪（不阻塞本次合并）

1. 测试环境变量清理统一化
   - 现状：`WISCODE_BUNDLED_NODE_*` 清理分散在多个 MCP 测试文件的 `beforeEach`。
   - 后续：迁移到统一 test preload，减少新增测试遗漏风险。

2. Builtin `maxkb-prod` 测试串扰
   - 现状：部分测试需要手动加 `maxkb-prod: { enabled: false }`。
   - 后续：补统一 helper 或测试模式短路，避免重复样板配置。

3. Node 升级 SOP 强约束化
   - 现状：已在 §14 定义维护策略。
   - 后续：发布流程中增加“旧版本目录清理检查”门禁，防止仓库体积持续膨胀。
