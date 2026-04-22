# WisCode Upstream Merge Checklist

本清单用于 WisCode 从上游 OpenCode 同步 tag、分支或指定提交时的标准流程。

目标只有两个：
- 吃到上游更新
- 不破坏 WisCode 现有品牌、配置隔离和发布链路

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
- 安装、升级、发布、签名链路
- OpenAPI / SDK 生成物

## 冲突解决原则

不要机械选 `ours` 或 `theirs`。高风险文件必须人工合并。

### 1. 品牌与产品身份必须保留

必须保留 WisCode 分叉语义：
- 产品名是 `WisCode`
- CLI 命令是 `wiscode`
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
- [packages/desktop/src/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop/src/index.tsx)
- [packages/desktop-electron/src/renderer/index.tsx](/Volumes/EXTENSION/works/morewis/opencode/packages/desktop-electron/src/renderer/index.tsx)

### 4. Solid 响应式代码要额外谨慎

这次 `v1.4.8` 合并的启动回归来自 Solid 组件写法变化。

合并 Solid 前端代码时，重点检查：
- `<Show>{(value) => ...}</Show>` 的 render-function 子节点
- 从 `<Show>` 提供的值继续派生 event handler / async callback / child props
- `project()!`、`session()!` 这类非空断言
- 把动态 accessor 直接传给依赖稳定对象的子组件
- keyed / non-keyed 控制流是否被改掉

经验规则：
- 如果子树依赖“当前对象实例”稳定存在，优先用 `keyed`
- 如果只是条件显示，不要把 `<Show>` 提供的 accessor 泄露到组件外部
- 不要为了“过 typecheck”用 `!` 硬顶运行时空值

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

### 4. 构建物最小验证

如果本次同步涉及桌面、CLI、更新器或安装链路，至少做一项：
- 本机构建成功
- 或对应平台已做一次手工验证

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

以后同步上游时，严格按本清单执行。
