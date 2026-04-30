# Sidecar 浏览器访问优化评审说明

## 1. 要解决的问题

### 1.1 现象
- 在桌面端状态弹层新增“复制服务器访问链接”后，复制出的 URL 形如：
  - `http://127.0.0.1:<port>/?auth_token=<base64(opencode:password)>`
- 浏览器打开该 URL 时：
  - 首个 document 请求可返回 200；
  - 但后续静态资源请求（`assets/*.js`、`assets/*.css`、`site.webmanifest`、`favicon`）返回 401；
  - 页面无法正常加载，并触发浏览器 Basic Auth 登录弹窗。

### 1.2 根因
- 现有服务端鉴权逻辑仅在**当前请求**含 `auth_token` 时，把它注入到 `Authorization` 头用于该请求校验。
- 浏览器后续资源请求不会自动携带首个页面 URL 上的 query 参数，因此资源请求未被鉴权，返回 401。

---

## 2. 方案设计

### 2.1 目标
- 保持 sidecar 原有 Basic Auth 安全边界；
- 允许用户通过“复制链接”在浏览器端一次打开并完整加载页面资源；
- 不影响 desktop 内部 SDK 请求链路。

### 2.2 方案
- 在 `AuthMiddleware` 中增加“query token -> cookie 会话化”：
  1. 首次请求若含 `auth_token`，继续按原逻辑进行 Basic 鉴权；
  2. 鉴权通过后，写入 `wiscode_auth_token` cookie；
  3. 后续请求若无显式 `Authorization`，允许回退使用 cookie token 做鉴权。

### 2.3 关键兼容策略
- 明确“**显式 Authorization 优先**”：
  - 若请求头已带 `Authorization`，中间件不使用 query/cookie 覆盖它；
  - 避免浏览器历史 cookie 干扰 desktop 客户端本来正确的授权头。

---

## 3. 代码修改点

### 3.1 App 端（复制链接能力）
- 文件：`packages/app/src/components/status-popover-body.tsx`
  - 在服务器行新增复制按钮（含 tooltip）；
  - 点击后调用复制逻辑，成功/失败分别 toast。

- 文件：`packages/app/src/util/server-access-url.ts`（新增）
  - `buildServerAccessUrl(server)`：
    - 有密码：拼 `?auth_token=<base64(username:password)>`
    - 无密码：返回基础 URL。

- 文件：`packages/app/src/util/server-access-url.test.ts`（新增）
  - 覆盖有/无密码两种 URL 生成行为。

### 3.2 Server 端（鉴权会话化）
- 文件：`packages/opencode/src/server/middleware.ts`
  - 新增 cookie 读写（`hono/cookie`）；
  - 鉴权输入来源改为：
    - 首选现有 `Authorization` 头；
    - 否则回退 `auth_token` query；
    - 再回退 `wiscode_auth_token` cookie；
  - 当存在 `auth_token` query 且鉴权通过后，下发 cookie：
    - `wiscode_auth_token`
    - `HttpOnly`
    - `SameSite=Lax`
    - `Path=/`
    - `Max-Age=28800`（8 小时）

- 文件：`packages/opencode/src/server/middleware.test.ts`（新增）
  - 用例覆盖：
    1. `auth_token` query 可通过且会下发 cookie；
    2. 后续仅 cookie 请求可通过（资源场景）；
    3. 缺失授权时仍返回 401；
    4. 未配置 server password 时放行；
    5. 有 cookie 时不覆盖显式 `Authorization`（desktop 兼容保障）。

---

## 4. 为什么这样改

### 4.1 与替代方案对比
- 方案 A：把 `auth_token` 透传到所有静态资源 URL
  - 缺点：需要改前端资源加载路径/构建产物注入，侵入大。
- 方案 B：首次 query token 成功后转 cookie（本次采用）
  - 优点：改动集中在鉴权中间件，对业务层和静态资源层零侵入；
  - 可复用浏览器 cookie 机制自然覆盖后续资源请求。

### 4.2 安全性边界
- 服务依旧要求有效 Basic token；
- cookie 仅是把已有 token 会话化，不扩大权限模型；
- `HttpOnly` 降低前端脚本读取敏感 token 的风险；
- 通过 `Max-Age=28800` 限制浏览器残留时长，降低公共机器场景风险。

---

## 5. 对 desktop 端影响评估

结论：**不会破坏 desktop 既有访问链路**，理由如下：
- desktop SDK 本身每个请求都显式携带 `Authorization`；
- 中间件现已保证“显式 `Authorization` 优先，不被 cookie 覆盖”；
- 即使浏览器环境残留旧 cookie，也不会影响 desktop 内部请求鉴权。

---

## 6. 验证与结果

### 6.1 已执行验证
- `packages/app`:
  - `src/util/server-access-url.test.ts` 通过；
  - `src/util/clipboard.test.ts` 通过；
  - `bun typecheck` 通过。

- `packages/opencode`:
  - `src/server/middleware.test.ts` 全通过；
  - `bun typecheck` 通过。

### 6.2 手动验证建议
1. 桌面端点击“复制链接”，在浏览器打开；
2. 确认 `assets/*.js`、`*.css`、`manifest` 不再 401；
3. 确认页面可正常渲染且不再弹 Basic Auth 登录框。

---

## 7. 变更清单

- `packages/app/src/components/status-popover-body.tsx`
- `packages/app/src/util/server-access-url.ts` (new)
- `packages/app/src/util/server-access-url.test.ts` (new)
- `packages/opencode/src/server/middleware.ts`
- `packages/opencode/src/server/middleware.test.ts` (new)
