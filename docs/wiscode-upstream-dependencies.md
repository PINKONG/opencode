# WisCode 当前保留的 Upstream 依赖清单

本文档记录当前仓库中**有意保留**、暂未切换为 WisCode 自有资源的 upstream 依赖，便于后续在自有站点、自有 API、自有文档准备完成后逐项替换。

## 1. 官方站点与公开页面

当前仍保留大量 `opencode.ai` 链接，主要原因是 WisCode 暂时没有独立站点，这些链接仍是可用的外部入口。

典型位置：

- `packages/web/src/content/docs/index.mdx`
- `packages/web/src/content/docs/providers.mdx`
- `packages/web/src/content/docs/zen.mdx`
- `packages/web/src/content/docs/go.mdx`
- `packages/web/config.mjs`
- `packages/opencode/src/product.ts`

典型用途：

- 安装页、认证页、分享页示例链接
- 文档 schema URL
- Zen / Go 等产品线接口地址
- Discord 入口

## 2. Provider / 产品线前缀

当前保留了若干 `opencode/*`、`opencode-go/*` 这类 provider 或模型前缀，因为它们代表现有服务端协议或外部产品线标识，不是简单文案。

典型位置：

- `packages/web/src/content/docs/zen.mdx`
- `packages/web/src/content/docs/go.mdx`
- `packages/web/src/content/docs/models.mdx`
- `packages/web/src/content/docs/agents.mdx`

## 3. 第三方生态包名

当前保留第三方 npm / GitLab / plugin 生态里的 `opencode-*` 名称，因为这些已经发布在外部仓库，不能在文档里擅自改名。

典型位置：

- `packages/web/src/content/docs/plugins.mdx`
- `packages/web/src/content/docs/providers.mdx`
- `packages/web/src/content/docs/gitlab.mdx`
- `packages/web/src/content/docs/sdk.mdx`

示例：

- `opencode-helicone-session`
- `opencode-gitlab-auth`
- `@opencode-ai/sdk`
- `nagyv/gitlab-opencode`

## 4. 兼容性文件名与内部存储名

有些文件名或 store 名仍保留 `opencode`，这是为了兼容历史数据或既有迁移逻辑，当前不建议仅因品牌替换而改动。

典型位置：

- `packages/desktop-electron/src/main/migrate.ts`
- `packages/desktop-electron/src/renderer/index.tsx`

示例：

- `opencode.settings.dat`
- `opencode.global.dat`
- `opencode.workspace.*.dat`

## 5. 环境变量命名

当前代码和文档中仍大量使用 `OPENCODE_*` 环境变量。这些是运行时兼容接口，暂未切换。

典型位置：

- `packages/web/src/content/docs/cli.mdx`
- `packages/web/src/content/docs/config.mdx`
- `packages/web/src/content/docs/server.mdx`
- `packages/opencode/src/**`

## 后续切换建议

当 WisCode 具备以下资源后，可以开始下一轮正式替换：

1. 自有官网与文档域名
2. 自有认证入口与分享页
3. 自有 Zen / Go 等服务端接口命名
4. 自有插件发布命名空间
5. 是否继续兼容 `OPENCODE_*` 环境变量的明确策略
