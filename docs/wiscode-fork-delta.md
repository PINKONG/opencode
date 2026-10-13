# WisCode Fork Delta

本文档记录 **WisCode 相对 OpenCode upstream 的长期分叉点**。

用途只有一个：
- 后续每次同步 OpenCode 时，先对照本文档，确认哪些修改必须保留

不要把本文档当成变更流水账。
它不是“我们改过什么”的历史清单，而是“以后合并不能丢什么”的基线清单。

配合以下文档一起使用：
- [docs/wiscode-upstream-merge-checklist.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-upstream-merge-checklist.md)
- [docs/wiscode-version-map.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-version-map.md)
- [docs/wiscode-upstream-dependencies.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-upstream-dependencies.md)

## 1. 产品身份与版本规则

### 必须保留

- 产品名是 `WisCode`
- CLI 公开号令是 `wiscode`
- CLI npm 包名是 `wiscode-ai`
- 对外版本号规则是：
  `WisCode = OpenCode - 0.4`

### 典型落点

- [packages/opencode/package.json](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/package.json)
- [packages/desktop/package.json](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/package.json)
- [packages/desktop-electron/package.json](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/package.json)
- [packages/extensions/zed/extension.toml](/Volumes/EXTENSION/works/morewis/opencode/packages/extensions/zed/extension.toml)
- [docs/wiscode-version-map.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-version-map.md)

### 合并时注意

- OpenCode 上游版本号不能直接覆盖 WisCode 对外版本号
- 任何发布链接里带版本号的地方都要跟随 WisCode 版本同步更新

## 2. 发布源、更新源、安装源

### 必须保留

- WisCode 对外发布仓库是 `PINKONG/opencode`
- 安装脚本、Zed 扩展、桌面更新、CLI 更新，凡是用户下载产物的入口，都应优先指向 `PINKONG/opencode`

### 典型落点

- [install](/Volumes/EXTENSION/works/morewis/opencode/install)
- [packages/extensions/zed/extension.toml](/Volumes/EXTENSION/works/morewis/opencode/packages/extensions/zed/extension.toml)
- [packages/opencode/test/branding/public-surface-branding.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/test/branding/public-surface-branding.test.ts)
- [packages/desktop-electron/package.json](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/package.json)

### 允许保留 upstream 的例外

- 仅统计、脚本、文档引用 upstream 仓库而不影响用户下载时，可暂时保留 `anomalyco/opencode`
- 这类保留项应参考 [docs/wiscode-upstream-dependencies.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-upstream-dependencies.md)

## 3. 桌面身份：显示名、包标识符、deep link、产物名

### 必须保留

- Tauri / Electron 桌面产品显示名是 `WisCode`
- 包标识符使用 WisCode 自有命名，不再沿用 OpenCode
- deep link scheme 是 `wiscode://`
- 桌面 sidecar 名称是 `wiscode-cli`

### 典型落点

- [packages/desktop/src-tauri/tauri.conf.json](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/tauri.conf.json)
- [packages/desktop/src-tauri/tauri.conf.prod.json](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/tauri.conf.prod.json)
- [packages/desktop-electron/electron-builder.config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/electron-builder.config.ts)
- [packages/desktop-electron/src/renderer/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/renderer/index.tsx)

### 合并时注意

- `Dev/Beta/Prod` 三个 channel 的显示名、bundle id、图标、安装器资源要分别检查
- Windows 安装器和卸载器的位图资源也属于桌面身份的一部分

## 4. CLI 命名与分发语义

### 必须保留

- npm 包名：`wiscode-ai`
- 命令名：`wiscode`
- 桌面 sidecar / 可执行产物名：`wiscode-cli`
- 用户最终执行的公开命令仍是 `wiscode`

### 典型落点

- [packages/opencode/package.json](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/package.json)
- [packages/opencode/script/build.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/script/build.ts)
- [packages/opencode/script/publish.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/script/publish.ts)
- [packages/plugin/script/publish.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/plugin/script/publish.ts)
- [packages/sdk/js/script/publish.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/sdk/js/script/publish.ts)

### 合并时注意

- 不要把公开命令误改回 `opencode`
- 不要把 sidecar 二进制名和用户命令名混为一谈

## 5. 配置隔离：`.wiscode` / `wiscode.json(c)`

### 必须保留

- 优先读取：
  - `.wiscode`
  - `wiscode.jsonc`
  - `wiscode.json`
- 兼容读取：
  - `.opencode`
  - `opencode.jsonc`
  - `opencode.json`
- 只写回 WisCode 新路径
- 同目录内 `.jsonc` 优先于 `.json`
- `.wiscode` 目录配置优先于项目根 `wiscode.json(c)`

### 典型落点

- [packages/opencode/src/config/config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/config.ts)
- [packages/opencode/src/config/agent.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/agent.ts)
- [packages/opencode/src/config/command.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/command.ts)
- [packages/opencode/src/cli/cmd/mcp.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/cli/cmd/mcp.ts)
- [packages/opencode/src/plugin/install.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/plugin/install.ts)

### 合并时注意

- 这是最容易被上游配置重构冲掉的一块
- 每次上游触及 `src/config/*`、`mcp.ts`、`plugin/install.ts` 都必须人工复核

## 6. OpenCode / WisCode 共存策略

### 必须保留

- WisCode 与官方 OpenCode 安装在同一台机器时，配置和运行状态不能互相覆盖
- 新写入路径应进入 WisCode 命名空间
- 旧 OpenCode 配置仅作为兼容读取源，不应成为新默认写入目标

### 典型落点

- [packages/opencode/src/config/config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/config.ts)
- [packages/opencode/src/cli/cmd/mcp.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/cli/cmd/mcp.ts)
- [packages/opencode/src/plugin/install.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/plugin/install.ts)

## 7. 供应商品牌边界

### 必须保留

- `OpenCode Zen`
- `OpenCode Go`
- `opencode/*`
- `opencode-go/*`

这些是 provider / 服务线 / 协议标识，不属于 WisCode 自身品牌文案，不能机械替换成 `WisCode Zen` 或 `WisCode Go`。

### 典型落点

- [packages/app/src/branding-surface.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/branding-surface.test.ts)
- [packages/console/app/src/i18n/](/Volumes/EXTENSION/works/morewis/opencode/packages/console/app/src/i18n)
- [packages/web/src/content/docs/](/Volumes/EXTENSION/works/morewis/opencode/packages/web/src/content/docs)

### 合并时注意

- 品牌替换时只替换 WisCode 自身身份，不替换 OpenCode 提供的外部服务名

## 8. 提示词与自我介绍

### 必须保留

- 系统提示词里的产品自称应为 WisCode
- 中文自我介绍基线是：
  `我是WisCode，摩尔元数提供的工业软件AI编程助手，专注于软件工程任务。`
- 同时保留“产品能力问题应优先查资料”的查询策略修复，不只覆盖 default/anthropic，也要覆盖实际使用的各 provider prompt

### 典型落点

- [packages/opencode/src/session/prompt/](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/session/prompt)
- [packages/opencode/test/session/prompt-branding.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/test/session/prompt-branding.test.ts)

### 合并时注意

- 上游常改 prompt 结构和路由文件
- 不要只改文案，不检查运行时实际会走哪个 prompt 文件

## 9. MaxKB 定制能力

### 必须保留

- WisCode 增加了 MaxKB 远程 MCP 的定制支持
- 包括：
  - `maxkb-hmac` 认证
  - 资源读取
  - 知识库浏览相关实验路由

### 典型落点

- [packages/opencode/src/config/mcp.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/mcp.ts)
- [packages/opencode/src/mcp/index.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/mcp/index.ts)
- [packages/opencode/src/server/routes/instance/experimental.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/routes/instance/experimental.ts)

### 合并时注意

- 上游如果重构 MCP 或实验路由，这些点非常容易丢
- 合并后至少要验证知识库浏览和 resource read 相关链路

## 9.1 全局配置目录与内置知识库 MCP 默认项

### 必须保留

- 全局配置目录必须是 `~/.config/wiscode`（而不是 `~/.config/opencode`）
- `Global.Path.config` 指向的命名空间必须与 WisCode 品牌一致
- `loadInstanceState` 必须保留内置 `maxkb-prod` 默认配置注入

### 典型落点

- [packages/core/src/global.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/core/src/global.ts)
- [packages/opencode/src/config/config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/config.ts)
- [packages/opencode/test/config/config.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/test/config/config.test.ts)
- [packages/opencode/test/server/httpapi-mcp.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/test/server/httpapi-mcp.test.ts)

### 合并时注意

- 上游若重构全局路径模块（`Global`/`core`）时，最容易把目录名回退到 `opencode`
- 上游若重构配置加载（`loadInstanceState`）时，最容易丢失内置 `maxkb-prod`
- 这两类回归会让 `~/.config/wiscode/wiscode.json` 里的用户 MCP 配置失效，且桌面知识库入口消失

## 10. 桌面内置 Node 与本地 MCP 兼容

### 必须保留

- 桌面端为本地 MCP 注入内置 Node 的能力
- 相关环境变量使用 `WISCODE_BUNDLED_NODE_*` 前缀

### 典型落点

- [packages/opencode/src/mcp/index.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/mcp/index.ts)
- [docs/plans/2026-04-23-desktop-bundled-node-for-local-mcp-design.md](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-04-23-desktop-bundled-node-for-local-mcp-design.md)

## 10.1 BMAD 集成（长期分叉能力）

以下语义每个 WisCode 版本都必须保留；具体合并门禁见 [上游合并清单](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-upstream-merge-checklist.md)：

- 发行物内置固定提交的 BMAD 技能快照和目标平台的 uv；用户无需自行安装 BMAD 或 uv，`wiscode bmad init` 与 `/bmad-init` 能在指定项目初始化。
- 技能落在项目 `.agents/skills/`，所有权记录在 `.wiscode/bmad-managed.json`；旧 `.opencode/bmad-managed.json` 只用于兼容读取和安全迁移。用户文件、确认协议和项目定制不能被升级过程无条件覆盖。
- CLI 与 V2/Web 从实际发现的 `bmad`、`bmad-*` 技能派生斜杠入口；`/bmad-help` 仅作 `bmad` 的兼容别名。已有同名命令优先，`/bmad-init` 不得被覆盖；列表和服务端执行都按当前项目及权限解析。
- 成功初始化后刷新该项目的技能/命令缓存；BMAD 脚本和 agent shell 使用随发行物内嵌的 uv。
- 合并 OpenCode 上游不等于升级 BMAD。`third_party/bmad/SOURCE.json` 固定快照；只有单独运行并验证 `script/update-bmad.ts` 才能变更 BMAD 来源或补丁。打包不能联网拉取浮动的 BMAD `main`。

典型落点：`third_party/bmad/`、`third_party/uv/`、`packages/opencode/src/bmad/`、`packages/core/src/bmad/manifest.ts`、`packages/opencode/src/command/index.ts`、`packages/core/src/command.ts`、`packages/server/src/handlers/session.ts`、CLI/桌面构建脚本及 Web 命令提交链路。详见 [BMAD 集成设计](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-10-10-bmad-integration.md)和[斜杠兼容设计](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-10-11-bmad-slash-commands-design.md)。

## 11. Sidecar 浏览器访问与 iframe 嵌入链路

### 必须保留

- Desktop 端“复制服务器访问链接”能力
- 浏览器直开 sidecar URL 时的鉴权回退：
  - `auth_token` query
  - `wiscode_auth_token` cookie
- iframe / 嵌入场景使用短期 `embed_session`
- Web UI HTML 注入 `oc-embed-session` meta，前端启动时能恢复该 session
- 前端调用 sidecar / server 时继续透传 `x-opencode-embed-session`
- sidecar LAN 配置语义：
  - 是否暴露局域网
  - 固定端口
  - 固定 token 模式
  - 对外展示地址
- 固定 token 模式开启后，访问 URL 可跨重启保持稳定

### 典型落点

- [packages/app/src/util/server-access-url.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/util/server-access-url.ts)
- [packages/app/src/util/embed-session.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/util/embed-session.ts)
- [packages/app/src/context/server.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/context/server.tsx)

## 12. Home 页模型选择崩溃补丁

### 当前状态

- 这个问题最初由上游 `v1.15.9` 的 home 路由 provider 边界缺陷暴露出来
- 根因是 `/` 根路由中的 home 页面直接打开模型选择对话框，而该对话框默认依赖 `LocalProvider`
- `LocalProvider` 只在目录路由中存在，因此会触发 `must be used within a context provider` 运行时错误
- WisCode 曾短期引入 `useGlobalModelSelection()` 作为兼容补丁
- 到上游 `v1.15.10` 时，home 页面交互已重构，相关临时补丁已回收，不再作为当前代码落点保留

### 当前落点

- [packages/app/src/pages/home.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/pages/home.tsx)
- [packages/app/src/components/dialog-select-model.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/components/dialog-select-model.tsx)

### 合并时注意

- 这不是长期必须保留的品牌/配置分叉语义，而是一个当前阶段的兼容补丁
- 这个问题在 `v1.15.10` 已经按“以上游最终修复为准”的原则处理，WisCode 不再保留 `useGlobalModelSelection()` 落地实现
- 合并时需要重新比较两边语义：
  - 上游是否把 home 模型入口移入正确 provider
  - 上游是否给模型对话框补了无 provider 安全路径
  - 上游是否改了 home 页模型交互本身
- 判断标准不是“保住我们的补丁”，而是保住正确行为：
  - home 页点击 `Model` 不崩
  - session 页继续使用 `local.model`
  - 最终行为与上游正式设计一致
- [packages/app/src/utils/server.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/utils/server.ts)
- [packages/opencode/src/server/middleware.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/middleware.ts)
- [packages/opencode/src/server/embed-session.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/embed-session.ts)
- [packages/opencode/src/server/routes/ui.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/routes/ui.ts)
- [packages/desktop-electron/src/main/server.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/main/server.ts)
- [packages/desktop-electron/src/main/sidecar-config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/main/sidecar-config.ts)
- [packages/desktop/src-tauri/src/server.rs](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/src/server.rs)
- [packages/desktop/src-tauri/src/sidecar_config.rs](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/src/sidecar_config.rs)
- [docs/sidecar-browser-access-review.md](/Volumes/EXTENSION/works/morewis/opencode/docs/sidecar-browser-access-review.md)

### 合并时注意

- 这是 WisCode 自己新增的桌面嵌入能力，不是单纯品牌改名
- 上游如果重构 `server/middleware`、`server/routes/ui`、桌面入口、server context，最容易把这条链路冲掉
- 不要只保留“复制链接”按钮，而丢掉 `embed_session`、HTML 注入或固定 token 语义
- Tauri 和 Electron 两条桌面链路都要对齐检查

## 12. 内置 `/init` 命令屏蔽策略

### 必须保留

- WisCode 不启用内置 `/init` slash command（避免上游默认命令在会话命令列表中回流）
- 即使 `Command.Default.INIT` 常量仍保留给 HTTP API / 兼容调用，命令注册列表也不能自动暴露 `init`

### 典型落点

- [packages/opencode/src/command/index.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/command/index.ts)
- [packages/opencode/src/project/project.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/project/project.ts)
- [packages/opencode/src/server/routes/instance/session.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/routes/instance/session.ts)

### 合并时注意

- 上游如果改 `command/index.ts`、`session` 路由或 project 初始化链路，最容易把内置 `/init` 命令重新注册回来
- 合并后要确认 `Command.state` 中没有把 `init` 加入默认 commands 列表
- 如果保留 `/session/:sessionID/init` 这类 API 兼容入口，也不能等价为重新开放 slash command

## 13. 品牌资源与安装器资源

### 必须保留

- 桌面首页 logo
- 启动 logo
- TUI / `wiscode-cli` 启动页 ASCII logo 必须显示 WisCode，而不是上游 OpenCode
- 应用图标
- Windows 安装器 header/sidebar 图
- Windows 卸载器图

### 典型落点

- [packages/tui/src/logo.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/tui/src/logo.ts)
- [packages/tui/test/logo.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/tui/test/logo.test.ts)
- [packages/desktop/src-tauri/icons/](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/icons)
- [packages/desktop-electron/icons/](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/icons)
- [packages/desktop/src-tauri/assets/](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/assets)

### 合并时注意

- 上游改资源目录结构时，最容易把这些位图路径冲回去
- 上游改 TUI 首页或 `packages/tui/src/logo.ts` 时，最容易把 CLI 启动页品牌冲回 `opencode`

## 14. 品牌回归测试

### 必须保留

- Web / install / Zed / app visible copy 的品牌测试
- TUI / `wiscode-cli` 启动页 logo 品牌测试
- OpenCode Zen / Go 边界测试
- titlebar Portal 安全测试

### 典型落点

- [packages/opencode/test/branding/public-surface-branding.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/test/branding/public-surface-branding.test.ts)
- [packages/app/src/branding-surface.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/branding-surface.test.ts)
- [packages/tui/test/logo.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/tui/test/logo.test.ts)
- [packages/app/src/components/titlebar-portal.test.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/components/titlebar-portal.test.ts)

## 15. 已知允许保留的 upstream 依赖

以下内容目前是**有意保留**，不要在每次 merge 时误判为漏改：

- `opencode.ai` 官方站点与文档链接
- 第三方生态包名里的 `opencode-*`
- 某些兼容性 store / 文件名里的 `opencode`
- `OPENCODE_*` 环境变量

详细列表看：
- [docs/wiscode-upstream-dependencies.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-upstream-dependencies.md)

## 16. 合并时的最小核对顺序

每次同步 OpenCode 前后，至少按这个顺序核对：

1. 版本号是否符合 `OpenCode - 0.4`
2. 品牌身份是否仍是 WisCode
3. 配置隔离是否仍是“读旧写新”
4. 发布源 / 更新源是否仍指向 `PINKONG/opencode`
5. OpenCode Zen / Go 是否没有被误替换
6. sidecar 浏览器访问 / iframe 嵌入链路是否仍可用
7. MaxKB / MCP / 资源读取定制是否仍在
8. 桌面标题栏、知识库、设置页、模型选择是否做过冒烟验证
9. 全局配置目录是否仍为 `~/.config/wiscode`，且 `~/.config/wiscode/wiscode.json` 的 MCP 配置可生效
10. 内置 `/init` slash command 是否仍保持屏蔽（未重新出现在默认命令列表）
11. BMAD 快照、内嵌 uv、`/bmad-init`、项目技能发现和 CLI/V2/Web 斜杠执行是否仍完整

## 17. 维护规则

- 每次出现新的“必须长期保留的分叉点”，都要补到本文档
- 如果某个分叉点已经被完全移除或不再需要，也要同步删掉本文档里的对应项
- 不要把临时调试结论写进来，只记录长期有效的 fork 语义

### 什么改动必须写进本文档

满足任一条件，就应该补进本文档：

- 下次合并 OpenCode 时一旦丢失，会构成明显产品回归
- 这是 WisCode 独有能力，不是单纯跟随 upstream 的实现细节
- 这项能力横跨多个包、多个入口，后续仅靠记忆很难完整保留
- 这项能力已经形成固定语义，例如命名、优先级、配置路径、鉴权规则、发布目标
- 上游后续高概率会改到同一区域，存在反复被冲掉的风险

典型例子：

- 品牌身份和版本规则
- 配置隔离规则
- 发布源 / 更新源
- 桌面 sidecar、iframe、嵌入访问链路
- MaxKB / MCP 定制能力

### 什么改动通常不需要写进本文档

以下改动通常不需要写进本文档，但应尽量用测试、提交记录或局部说明保护：

- 一次性 bugfix
- 临时调试代码
- 纯重构但不改变外部语义
- 跟随上游做的小型兼容性改动
- 能够从测试名称和提交信息直接看懂的局部实现细节

### 文档、测试、清单的分工

- `fork-delta` 记录“必须长期保留的分叉语义”
- 测试负责自动发现功能回归
- `upstream-merge-checklist` 记录合并时的检查动作、关键词和冒烟路径

如果一个改动很重要，但你不确定要不要写进本文档，默认做法是：

1. 先补测试
2. 再问自己：“这是不是以后每次合并上游都要主动记住的一条 WisCode 规则？”
3. 如果答案是“是”，再补进本文档
