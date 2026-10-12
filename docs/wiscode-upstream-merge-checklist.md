# WisCode Upstream Merge Checklist

本清单用于 WisCode 从上游 OpenCode 同步 tag、分支或指定提交时的标准流程。

目标只有两个：
- 吃到上游更新
- 不破坏 WisCode 现有品牌、配置隔离、BMAD 集成和发布链路

开始任何一次 upstream merge 前，先通读：
- [docs/wiscode-fork-delta.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-fork-delta.md)

## 适用范围

以下场景都使用本清单：
- 合并 `anomalyco/opencode` 的新 tag
- 挑选上游单个或多个提交
- 处理上游大版本重构后的品牌补丁回放

## 合并前

### 1. 先确认基线

开始前必须明确：
- 当前 WisCode 分支名
- 当前 WisCode 版本号
- 对应的上游基线版本
- 本次要同步的上游 tag 或提交

建议同时更新：
- [docs/wiscode-version-map.md](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-version-map.md)

### 2. 先隔离本地杂项改动

合并前先清理与本次同步无关的工作区改动。

原则：
- 无关改动先提交，或先 stash
- 不要把临时实验、快照文件、手工调试改动混进 merge commit
- 用户已有的独立改动不要被你顺手带进 merge commit

### 3. 先看上游改了哪里

至少先看：
- `packages/app`
- `packages/desktop`
- `packages/desktop-electron`
- `packages/opencode`
- `packages/sdk`

尤其关注：
- 路由和入口文件
- Solid 组件重构
- 配置路径
- sidecar / server 鉴权与嵌入链路
- 安装、升级、发布、签名链路
- OpenAPI / SDK 生成物

## 冲突解决原则

不要机械选 `ours` 或 `theirs`。高风险文件必须人工合并。

### 1. 品牌与产品身份必须保留

必须保留 WisCode 分叉语义：
- 产品名是 `WisCode`
- CLI 命令是 `wiscode`
- TUI / `wiscode-cli` 启动页和 `/exit` 退出页 logo 显示 WisCode，不能回退为上游 OpenCode
- npm 包名按当前仓库策略保持
- 更新源、发布源、安装源指向 `PINKONG/opencode`
- 供应商品牌不要误改，例如 `OpenCode Zen`

### 2. 配置隔离必须保留

必须保留当前配置语义：
- 优先读取 `.wiscode` / `wiscode.jsonc` / `wiscode.json`
- 兼容读取旧 `.opencode` / `opencode.jsonc` / `opencode.json`
- 只写回 WisCode 新路径
- 同目录内 `.jsonc` 优先于 `.json`

### 3. 本地结构优先，上游逻辑择优吸收

对改动大的本地文件，优先保留本地结构，再逐段吸收上游新增能力。

不要因为上游改了写法，就顺手把整段替换掉。

特别是这些文件：
- [packages/app/src/pages/layout.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/pages/layout.tsx)
- [packages/app/src/pages/session.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/pages/session.tsx)
- [packages/app/src/pages/session/session-side-panel.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/pages/session/session-side-panel.tsx)
- [packages/app/src/components/session/session-header.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/components/session/session-header.tsx)
- [packages/app/src/context/server.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/context/server.tsx)
- [packages/app/src/utils/server.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/app/src/utils/server.ts)
- [packages/desktop/src/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src/index.tsx)
- [packages/desktop/src/renderer/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src/renderer/index.tsx)
- [packages/desktop-electron/src/renderer/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/renderer/index.tsx)
- [packages/opencode/src/server/middleware.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/middleware.ts)
- [packages/opencode/src/server/routes/ui.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/routes/ui.ts)
- [packages/desktop-electron/src/main/server.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/main/server.ts)
- [packages/desktop-electron/src/main/sidecar-config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/main/sidecar-config.ts)
- [packages/desktop/src-tauri/src/server.rs](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/src/server.rs)
- [packages/desktop/src-tauri/src/sidecar_config.rs](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src-tauri/src/sidecar_config.rs)

### 4. Solid 响应式代码要额外谨慎

这次 `v1.4.8` 合并的启动回归来自 Solid 组件写法变化。
这次 `v1.15.9` 合并还暴露过一个 home 路由 provider 边界回归：
- `packages/app/src/pages/home.tsx` 在 `/` 根路由直接弹出模型选择对话框
- `packages/app/src/components/dialog-select-model.tsx` 默认依赖 `useLocal().model`
- `LocalProvider` 只在目录路由中存在
- 结果是点击 home 页 `Model` 按钮直接因缺少 provider 崩溃

合并 Solid 前端代码时，重点检查：
- `<Show>{(value) => ...}</Show>` 的 render-function 子节点
- 从 `<Show>` 提供的值继续派生 event handler / async callback / child props
- `project()!`、`session()!` 这类非空断言
- 把动态 accessor 直接传给依赖稳定对象的子组件
- keyed / non-keyed 控制流是否被改掉
- home / 根路由里弹出的 dialog、popover、selector 是否偷偷依赖了只在目录或 session 路由存在的 context/provider

经验规则：
- 如果子树依赖“当前对象实例”稳定存在，优先用 `keyed`
- 如果只是条件显示，不要把 `<Show>` 提供的 accessor 泄露到组件外部
- 不要为了“过 typecheck”用 `!` 硬顶运行时空值
- 如果某个 UI 在 home 根路由可触发，不要默认它一定跑在 `LocalProvider` / `SDKProvider` / `Session` 相关 provider 内
- 合并后要人工点一遍 home 页的 `Model`、目录选择、server 选择等入口，确认不会出现 “must be used within a context provider” 这类运行时崩溃

### 5. 全局配置目录与内置知识库 MCP 不能回退

这是近期合并事故新增的硬规则：

- `Global.Path.config` 必须落在 `~/.config/wiscode`，不能回退到 `~/.config/opencode`
- [packages/core/src/global.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/core/src/global.ts) 里的 app 目录名必须是 `wiscode`
- [packages/opencode/src/config/config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/config/config.ts) 的 `loadInstanceState` 必须保留内置 `maxkb-prod` 默认注入

这两项任一被冲掉，会出现直接回归：

- `~/.config/wiscode/wiscode.json` 的全局 MCP 配置不生效
- 桌面端左下角知识库入口消失，MCP 列表缺少 `maxkb-prod`

### 6. Sidecar embed 链路必须整条保留

这是近期合并事故新增的硬规则。

sidecar embed 不是单文件功能，而是跨 `packages/app`、`packages/opencode`、`packages/desktop` 的构建和运行时链路。

必须同时保留：
- [packages/desktop/src/main/index.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src/main/index.ts) 不能重新设置 `OPENCODE_DISABLE_EMBEDDED_WEB_UI`
- [packages/opencode/script/build-node.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/script/build-node.ts) 必须继续生成非空 `opencode-web-ui.gen.ts`
- [packages/desktop/electron.vite.config.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/electron.vite.config.ts) 必须继续复制 node dist 中除 `node.js` / `node.js.map` 之外的 embedded UI 资源
- [packages/opencode/src/server/routes/ui.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/routes/ui.ts) 必须把 embedded 清单中的相对路径解析成基于 node bundle 的绝对路径，再读文件
- [packages/desktop/src/renderer/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src/renderer/index.tsx) 的 app `PlatformProvider` 必须继续注入 `getSidecarLanConfig` / `setSidecarLanConfig` / `getSidecarLanStatus`，否则设置页的网络配置区会被条件渲染隐藏
- [packages/desktop/src/renderer/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src/renderer/index.tsx) 必须继续拦截 `install-cli` 菜单命令并调用 renderer 侧 `installCli()`

这几项任一被冲掉，都会出现直接回归：
- 浏览器打开 sidecar 链接时回退到线上 UI，导致品牌错位或认证错位
- `/?auth_token=...` 跳转到 `/?embed_session=...` 后返回 `{"error":"Not Found"}`
- 打包后 desktop 正常启动，但浏览器访问 sidecar embed URL 失败
- 设置页缺少“网络配置 / Expose local server to LAN”
- mac 菜单存在 `Install CLI...` 但点击后没有执行安装

### 7. 内置 `/init` 命令必须保持屏蔽

这是 WisCode 的长期分叉语义，不能被上游默认命令注册逻辑覆盖。

必须同时确认：
- [packages/opencode/src/command/index.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/command/index.ts) 没有把 `init` 加回默认 commands 列表
- [packages/opencode/src/project/project.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/project/project.ts) 的 project 初始化订阅逻辑没有反向要求 slash `/init` 可见
- [packages/opencode/src/server/routes/instance/session.ts](/Volumes/EXTENSION/works/morewis/opencode/packages/opencode/src/server/routes/instance/session.ts) 与 HTTP API 兼容入口可保留，但不能等价为重新开放内置 slash command

### 8. BMAD 与内嵌 uv 必须作为发行能力保留

每次同步上游 OpenCode 都要保护这条跨包链路：
- `third_party/bmad/SOURCE.json`、vendored 技能与最小补丁保持固定快照；`third_party/uv/` 的各平台离线构建归档及校验、CLI/桌面资源复制逻辑不能丢。
- `wiscode bmad init`、`/bmad-init` 继续使用内嵌 uv，在项目 `.agents/skills/` 初始化技能，通过 `.opencode/bmad-managed.json` 管理 WisCode 拥有的文件；保留用户改动、升级冲突与删除/迁移确认语义。不要退回 `npx skills` 或系统 uv 兜底。
- CLI 和 V2/Web 的 `/` 补全与执行继续从当前项目实际发现的 BMAD 技能派生，`/skills` 仍可访问；自定义/内置/MCP 同名命令优先，`/bmad-help` 是 `bmad` 的兼容别名，`/bmad-init` 不能被技能覆盖。执行时由服务端重解析技能并检查 agent 权限，不信任客户端缓存正文。
- 初始化成功后，管理清单变化必须使该项目的技能和命令缓存失效；其他项目不受影响。agent shell 的 `uv run` 也必须命中内嵌 uv，而不只初始化器能找到它。

高风险落点：`packages/opencode/src/bmad/`、`packages/core/src/bmad/`、`packages/opencode/src/command/index.ts`、`packages/core/src/command.ts`、`packages/server/src/handlers/session.ts`、CLI/Web 命令展示与提交、`packages/opencode/script/build.ts`、桌面构建脚本和资源配置。

同步 OpenCode **不自动更新 BMAD**。不要在 merge、构建或启动时拉取 BMAD `main`；需升级时另行选择提交，运行 `script/update-bmad.ts`，审查补丁并通过 [BMAD 集成设计](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-10-10-bmad-integration.md)中的升级门禁。

## 合并过程中必须做的事

### 1. 冲突清完后，先找残留品牌/路径风险

至少搜索这些关键词：
- `opencode`
- `OpenCode`
- `.opencode`
- `opencode.json`
- `wiscode`
- `wiscode.json`
- `PINKONG/opencode`
- `anomalyco/opencode`
- `embed_session`
- `wiscode_auth_token`
- `x-opencode-embed-session`
- `Command.Default.INIT`
- `/init`
- `bmad-init`
- `WISCODE_BUNDLED_UV_PATH`
- `bmad-managed.json`

### 2. OpenAPI / SDK 改动必须成套处理

如果服务端路由或 schema 变了：
- 更新服务端实现
- 重新生成 SDK
- 检查调用方类型是否还匹配

不要只改服务端，不更新 SDK 生成物。

### 3. 不要忽略“高风险但能 typecheck 通过”的 UI 回归

这次事故说明：
- `bun typecheck` 通过，不代表桌面端一定能启动
- Solid 生命周期问题经常只在运行时爆炸

## 提交前硬性验证

以下步骤是 merge commit 之前的硬门槛。

### 1. 类型检查

必须至少运行：

```bash
cd packages/opencode && bun typecheck
cd packages/app && bun typecheck
```

如本次合并涉及桌面专属逻辑，额外检查相关包。

### 2. 聚焦测试

至少跑与本次冲突和改动直接相关的测试。

示例：

```bash
cd packages/opencode && bun test test/config/config.test.ts
cd packages/app && bun test --preload ./happydom.ts ./src/pages/layout/helpers.test.ts ./src/context/layout.test.ts
```

如果改了知识库、设置、会话页、桌面入口，补跑对应测试。

如果改了 TUI 首页、CLI 启动页、`/exit` 退出页或 `packages/tui/src/logo.ts`，必须额外补跑：

```bash
cd packages/tui && bun test test/logo.test.ts test/util/presentation.test.ts
cd packages/tui && bun run typecheck
```

如果改了 sidecar / iframe / 浏览器访问链路，至少补跑：

```bash
cd packages/opencode && bun test ./src/server/middleware.test.ts ./src/server/routes/ui.test.ts
cd packages/app && bun test --preload ./happydom.ts ./src/util/server-access-url.test.ts ./src/util/embed-session.test.ts
cd packages/desktop-electron && bun test ./src/main/lan.test.ts ./src/main/sidecar-config.test.ts
```

如果改到了以下任一文件，也按 sidecar embed 高风险处理：
- `packages/opencode/script/build-node.ts`
- `packages/opencode/src/server/routes/ui.ts`
- `packages/desktop/electron.vite.config.ts`
- `packages/desktop/src/main/index.ts`

额外补跑：

```bash
cd packages/opencode && bun test ./src/server/routes/ui.test.ts ./test/branding/build-node-script.test.ts
cd packages/desktop && bun test ./src/main/branding.test.ts
```

如果改了以下任一文件，必须额外补跑：
- `packages/core/src/global.ts`
- `packages/opencode/src/config/config.ts`
- `packages/opencode/src/mcp/*`

```bash
cd packages/opencode && bun test test/config/config.test.ts test/server/httpapi-mcp.test.ts
```

如果改了以下任一文件，必须额外确认内置 `/init` 屏蔽没有回归：
- `packages/opencode/src/command/index.ts`
- `packages/opencode/src/project/project.ts`
- `packages/opencode/src/server/routes/instance/session.ts`
- `packages/opencode/src/server/routes/instance/httpapi/handlers/session.ts`

至少执行：

```bash
cd packages/opencode && bun test test/server/httpapi-session.test.ts test/server/httpapi-instance.legacy.test.ts
```

### 2.1 BMAD 常驻回归门禁

每次上游同步都要运行 BMAD 初始化、缓存刷新和斜杠命令的聚焦测试，而不只在冲突文件包含 `bmad` 时运行：

```bash
cd packages/opencode && bun test test/bmad test/command/bmad-refresh.test.ts test/cli/run/bmad-slash.test.ts
cd packages/core && bun test test/bmad-manifest.test.ts test/command.test.ts test/skill.test.ts
cd packages/app && bun test --conditions=browser --preload ./happydom.ts ./src/context/global-sync/command-refresh.test.ts ./src/components/prompt-input/submit.test.ts
```

`test/bmad/vendor-update.test.ts` 还要求约定位置的本地 BMAD checkout，且端到端测试需要 uv；运行前确认前置条件，不得把缺失导致的跳过当成验收通过。若合并触及 V2 Protocol/Server 命令契约，还须从 `packages/client` 执行 `bun run generate`，并对受影响的 `core`、`protocol`、`server`、`client` 包运行 `bun typecheck`，检查生成客户端和 Web 提交路径。

### 3. 桌面端冒烟验证

这一步不能省。

至少确认：
- 应用能启动，不崩溃
- 首页能打开
- 侧边栏能渲染
- 会话页能打开
- 设置页能打开

如果这次合并碰到这些区域，必须现场点一遍：
- 文件树
- 终端区域
- 模型选择
- 知识库入口
- 标题栏 / 右上角按钮
- 浏览器访问 sidecar 链接
- iframe / 嵌入 URL 场景（如果本次改到了相关链路）

sidecar embed 场景至少确认这 4 点：
- `/?auth_token=...` 会先 302 到 `/?embed_session=...`
- `/?embed_session=...` 打开的是本地嵌入 UI，不是线上 `app.opencode.ai`
- 页面能正常进入会话界面，不返回 `{"error":"Not Found"}`
- 浏览器里显示的是 WisCode 品牌资源，而不是上游 OpenCode 首页资源

CLI / TUI 场景至少确认：
- `wiscode` / `wiscode-cli` 启动页顶部 ASCII logo 显示 WisCode，而不是上游 OpenCode
- 使用 `/exit` 退出后的 epilogue ASCII logo 显示 WisCode，`Continue` 命令显示 `wiscode -s ...`
- `packages/tui/src/logo.ts` 的主 `logo.text` 仍为 `wiscode`

BMAD 场景至少在临时项目确认：`/bmad-init` 或 `wiscode bmad init --project-root <临时项目>` 返回 `ready`，生成 `.agents/skills/` 与 `_bmad/`；`/skills` 和 CLI、V2/Web 的 `/` 补全出现已安装的 BMAD 技能，`/bmad-agent-analyst` 能实际执行，`/bmad-help` 可用；重跑初始化后无需重启即可刷新入口。确认未安装的技能不出现、同名用户命令优先，并在 agent shell 中核对 `uv` 来自内嵌资源。

### 4. 构建物最小验证

如果本次同步涉及桌面、CLI、更新器或安装链路，至少做一项：
- 本机构建成功
- 或对应平台已做一次手工验证

每个待发布版本还必须检查最终 CLI 和桌面安装产物（不是仅检查源码或中间 `resources/` 目录）：目标平台的 BMAD 快照、uv 可执行文件与许可证齐全，资源解析路径正确；用产物在临时项目完成一次初始化和后续 `uv run`。Windows 需在 Windows 环境验证，不能用 macOS 交叉构建代替。离线构建不得临时下载 BMAD 或 uv；首次初始化所需 Python/依赖仍可能联网，二者不要混淆。

如果本次同步涉及 sidecar embed / 浏览器访问链路，构建后额外确认：
- `packages/desktop/out/main/chunks` 中存在 `index-*.html`
- 同目录存在 `favicon-*`、`site-*.webmanifest`、`social-share-*`、`oc-theme-preload-*.js`
- `out/main/chunks/node-*.js` 中仍包含 embedded UI 资源映射和相对路径转绝对路径逻辑

### 5. 版本号硬门禁（必须执行）

这是每次上游合并后的强制 gate，顺序不能变：

- merge 完成
- 版本号统一到本次目标版本（例：`1.0.43`）
- 跑全仓 residual grep
- gate 通过后才允许提交

执行命令（在仓库根目录）：

```bash
bun script/check-upstream-merge-version-gate.ts --version 1.0.N
```

说明：
- 该脚本会校验所有约定包（含 `packages/opencode`、`sdks/vscode`、`packages/extensions/zed/extension.toml`）是否统一到目标版本
- 同时会拦截上一版本残留（例如 `1.0.42` / `1.14.42` / `download/v1.0.42/`）的 residual grep 命中
- 任一失败即返回非 0，视为“禁止提交”

## 浏览器 / 本地 Web 调试补充

这部分不是只给 merge 用。

以后只要出现“浏览器端异常、桌面端正常、源码看起来已经修了”的情况，优先按下面顺序排查。

### 1. 先确认前后端是不是同一版

这次知识库问题的真实根因不是前端代码没改对，而是：
- 浏览器前端已经是新代码
- `4096` 上跑着的 WisCode 后端还是旧进程
- 前后端版本错位，导致浏览器命中旧行为

先查本地进程：

```bash
lsof -iTCP:4096 -sTCP:LISTEN -n -P
ps -p <pid> -o pid=,lstart=,etime=,command=
```

如果进程启动时间早于本次代码变更，优先重启后端，再继续看问题。

默认启动命令：

```bash
cd packages/opencode
bun run --conditions=browser ./src/index.ts serve
```

### 2. 浏览器开发时，不要把旧进程当成“源码行为”

本地 Web 调试推荐固定成两段：

```bash
cd packages/opencode && bun run --conditions=browser ./src/index.ts serve --port 4096
cd packages/app && bun dev -- --port 3001
```

如果浏览器访问的是 Vite 页面，但接口连的是一个几小时前启动的旧 `serve` 进程，页面会表现得像“前端修复无效”。

### 3. 知识库报 `contents[0].text` 时，先区分是解析问题还是服务端回了 HTML

这次排查里，表面错误是：

```text
MaxKB resource response missing contents[0].text
```

但真实返回其实是：
- `GET /experimental/resource/read?...`
- `content-type: text/html;charset=UTF-8`
- body 是整页 HTML，不是 MCP `contents`

所以这类错误不要立刻认定为 MaxKB payload 结构变了。

先直接验证接口：

```bash
curl -sv 'http://127.0.0.1:4096/experimental/resource/read?client=<client>&uri=maxkb%3A%2F%2Fdatasets&directory=<dir>'
```

重点看：
- `content-type` 是不是 `application/json`
- body 是 MCP JSON，还是 HTML 页面

### 4. SDK 收到 `text/html;charset=UTF-8` 也要当成服务端版本不匹配

这次还暴露了一个次级问题：
- SDK 过去只拦截 `content-type === "text/html"`
- 遇到真实响应 `text/html;charset=UTF-8` 会漏掉
- 最终在上层误报成业务字段缺失

现在 SDK 已修成只要 `content-type` 包含 `text/html` 就直接报：
- `Request is not supported by this version of OpenCode Server (Server responded with text/html)`

以后如果再看到这个错误，优先怀疑：
- 后端版本过旧
- 路由没命中 API，回落到了 UI 页面
- 代理/入口配错了，打到了错误服务

### 5. 这类问题的排查顺序

按这个顺序，不要反过来：
- 先确认前端 dev server 是否真是最新源码
- 再确认 `4096` 后端进程是不是最新启动
- 再直接抓 `/experimental/resource/read` 的真实响应
- 最后才去怀疑 MaxKB payload 或前端解析逻辑

经验结论：
- “源码已修但浏览器仍报旧错”，优先查旧后端进程
- “业务字段缺失”如果响应是 HTML，本质是链路/版本问题，不是业务数据问题

## 提交规范

### 1. merge commit 只包含本次同步需要的内容

不要把这些混进去：
- 临时调试日志
- 本地实验文件
- 无关快照文件
- 用户未要求纳入的独立改动

### 2. 提交信息要带上游版本和 WisCode 版本

推荐格式：

```text
merge: 同步 OpenCode vX.Y.Z 并升级 WisCode 1.0.N
```

## 本次事故的直接教训

`v1.4.8` 的桌面启动回归说明两件事：
- 冲突解决时，`packages/app/src/pages/layout.tsx` 这类大文件不能机械吸收上游重构写法
- 对桌面端来说，“应用实际启动到首页”必须是 merge 前的硬门槛，而不是可选项

这次 sidecar embed 回归再补充两件事：
- “单测通过”不代表 embed 链路可用，sidecar embed 必须同时验证 build-node、desktop 资源复制和浏览器访问结果
- 对 embedded UI 来说，运行时相对路径解析属于打包问题，不是普通业务逻辑问题；以后只要上游改了 build、bundle、desktop packaging 或 UI 路由，都要重新过这条链路

以后同步上游时，严格按本清单执行。
