# Sidecar 浏览器访问与 iframe 嵌入方案（终审版）

## 1. 文档状态

- 本文档用于终审以下两类内容：
  1. 已上线改动（当前状态）；
  2. 待实现的最终方案（目标状态）。
- 结论先行：
  - 当前方案可解决“浏览器直接打开 sidecar 链接”问题；
  - 但不能稳定支持“跨站 iframe 嵌入”；
  - 最终方案采用一次性 `embed session`，不依赖嵌入方改造。

---

## 2. 当前状态（已上线）

### 2.1 已实现改动

- App 端新增“复制服务器访问链接”按钮（含 tooltip）。
- 复制 URL 规则：
  - 默认（LAN 未开启）有密码：`http://127.0.0.1:<port>/?auth_token=<base64(username:password)>`
  - LAN 开启时有密码：`http://<advertiseHost>:<port>/?auth_token=<base64(username:password)>`（`advertiseHost` 为自动探测或指定的 LAN IP）
  - 无密码：仅返回基础 URL。
- Server 端 `AuthMiddleware` 新增 query/cookie 回退：
  - 优先级：`Authorization` > `auth_token(query)` > `wiscode_auth_token(cookie)`；
  - 首次 query 鉴权成功后写入 cookie：
    - `wiscode_auth_token`
    - `HttpOnly`
    - `SameSite=Lax`
    - `Path=/`
    - `Max-Age=28800`（8 小时）。

### 2.2 当前收益

- 浏览器直接打开 sidecar 链接时，静态资源请求不再因缺少 query 而 401。
- Desktop 内部请求链路不受影响（显式 `Authorization` 优先）。

### 2.3 当前局限

- 跨站 iframe 下，第三方上下文对 cookie 携带不稳定；
- 因此即便首页可打开，后续 API/事件流请求仍可能 401；
- 该方案不是跨站 iframe 的长期主方案。

---

## 3. 问题复盘（为何需要最终方案）

### 3.1 目标约束

- 不改嵌入方（不要求对方加同站代理、改请求头、改前端逻辑）；
- sidecar 自身兜底跨站 iframe 可用性；
- 保持 API 安全边界，不把敏感数据暴露给未鉴权请求。

### 3.2 被否决方向

1. 仅“静态资源免鉴权”
   - 只能解决 JS/CSS 加载，不能解决 API/SSE/WS 鉴权；
   - 页面可能从“资源 401”变成“API 401”，不满足目标。

2. 纯 `auth_token` URL 透传长期化
   - URL 泄露面大（地址栏、历史、日志、截图等）；
   - 会话撤销/过期治理弱，不利于长期运维。

---

## 4. 最终方案（待实现，主方案）

### 4.1 方案结论

- 一次性实现 `embed session`，作为跨站 iframe 主路径；
- 不要求嵌入方改造；
- 不以第三方 cookie 作为核心依赖。

### 4.2 核心机制

1. 入口凭据
   - 允许通过现有 `auth_token` 或等价入口完成一次身份校验（仅引导用途）。

2. 会话签发
   - sidecar 在内存中创建短期 `embed_session`（例如 `Map<token, { exp }>`）；
   - 令牌短期有效、可过期、进程重启自然失效。

3. 请求映射
   - 对携带 `embed_session` 的请求，服务端在中间件中映射为内部 `Authorization`；
   - 覆盖 UI 资源、API、SSE、WS 访问路径。

4. 前端依赖
   - 前端仅消费短期 `embed_session`（来源由 sidecar 注入/引导）；
   - 不依赖跨站第三方 cookie 持久化。

### 4.3 关键设计要求

- 保持兼容：现有显式 `Authorization` 路径不变；
- 最小暴露：避免长期把凭据放 URL；
- 安全默认：会话短时有效，超时即失效；
- 可观测：无效/过期会话有明确错误与日志脱敏。

### 4.4 固定 token 模式（新增需求）

- 目标：满足 iframe 嵌入对“入口 URL 稳定性”的要求，避免 Desktop 每次重启后 `auth_token` 变化。
- 背景：当前 Tauri sidecar 启动时会注入随机 `OPENCODE_SERVER_PASSWORD`（UUID），导致 `auth_token` 随重启变化。
- 新增配置：
  - 在“网络”高级配置中新增开关：`固定 token 模式`（默认关闭）。
  - 开启后不再“仅使用本次随机密码”作为唯一来源，而是使用固定密码解析链路。
- 固定密码解析优先级（高 -> 低）：
  1. 用户显式配置的固定密码（后续可在设置项中补充）；
  2. 进程环境变量 `OPENCODE_SERVER_PASSWORD`；
  3. 本地持久化随机密钥（首次生成并持久化，用于稳定 token）。
- 分阶段范围（避免歧义）：
  - 当前阶段实现优先级 2 和 3；
  - 优先级 1（用户显式配置固定密码）属于后续增强项，不作为当前阶段阻塞条件。
- 失败与兜底策略：
  - 禁止使用弱硬编码默认值（如 `123456`）；
  - 若上游来源不可用，必须回退到“本地持久化随机密钥”或明确阻止开启并提示，不允许静默退回不安全默认值。
- 结果约束：
  - 在同一台机器、同一配置下，`auth_token` 可跨重启保持稳定；
  - 用户主动更改固定密码后，`auth_token` 才变化（符合预期）。

---

## 5. 安全边界与风控要求

### 5.1 默认安全基线

- sidecar 默认仅监听 `127.0.0.1`；
- 默认仅本机可访问。

### 5.2 LAN 暴露（高级模式）

- 单独提供“高级模式”开启 LAN 暴露；
- 非默认能力，必须用户主动启用；
- LAN 开启后监听 `0.0.0.0`；
- 对外展示地址可配置（自动探测 / 指定 IP）；
- 对外展示地址使用本机可达地址。
- 后续增强项（非当前阶段）：
  - 支持仅绑定指定网卡/IP（进一步缩小暴露面）。

#### 5.2.1 macOS + VPN 选址注记（已处理）

- 现象：
  - 部分 macOS 设备在开启 VPN 后，会出现“应用停在启动 Logo、无法进入主界面”的问题。
- 根因：
  - 自动 LAN 选址可能命中 `utun` 等 point-to-point 虚拟网卡地址；
  - 前端健康检查若使用该不可达地址，会在 `ConnectionGate` 长时间 pending。
- 当前策略：
  - Tauri 端在 LAN 自动选址时，优先排除 VPN/虚拟网卡地址（如 `utun`）与链路本地地址（`169.254.x.x`）；
  - 在可用候选中优先选择活动网卡的常规 IPv4 地址；
  - 若无更优地址，才回退到 route 探测结果。

### 5.3 启用前风险提示（必需）

- 明示“服务将对局域网可见”；
- 明示“访问链接/凭据泄露风险上升”；
- 明示“仅建议在受信网络开启，使用后及时关闭”；
- 需用户确认后才允许开启。

### 5.4 固定 token 模式安全要求（新增）

- 固定 token 模式属于“安全-稳定性权衡”能力，默认关闭；
- 开启后应增加说明：
  - token 将在配置不变时长期有效；
  - 若设备处于共享/不受信环境，风险上升；
  - 建议配合 LAN 开关按需启用并及时关闭。
- 密码及衍生 token 不写日志明文、不在错误信息中回显。

---

## 6. 影响评估

### 6.1 对 Desktop 的影响

- Electron Desktop：已通过 flag 禁用嵌入 UI 路径，不受影响；
- Tauri Desktop：主 WebView 走 `tauri://`，不经 sidecar HTTP UI，不受主流程影响；
- 外部浏览器访问 sidecar（含 iframe）是本次目标场景，改动仅影响该路径。

### 6.2 兼容性要求

- 保持现有“复制链接直开浏览器”能力可用；
- 不破坏已有 SDK/CLI 显式鉴权链路；
- 错误场景（过期/无效会话）行为可预期。

---

## 7. 验证现状（已完成）

### 7.1 已执行验证

- `packages/app`：
  - `bun test --preload ./happydom.ts ./src/util/server-access-url.test.ts ./src/util/embed-session.test.ts` 通过；
  - `bun typecheck` 通过。
- `packages/desktop-electron`：
  - `bun test ./src/main/lan.test.ts ./src/main/sidecar-config.test.ts` 通过；
  - `bun typecheck` 通过。
- `packages/opencode`：
  - `bun test ./src/server/middleware.test.ts` 通过；
  - `bun typecheck` 通过。

### 7.2 已知事实

- 直接浏览器访问：可用；
- 跨站 iframe：当前 cookie 方案不可稳定依赖，需 `embed session` 主方案。

---

## 8. 最终方案验收标准（待实现）

1. 不改嵌入方代码的前提下，跨站 iframe 可稳定加载 UI 与资源。
2. 页面加载后 API/SSE/WS 可正常工作，无系统性 401。
3. `embed_session` 具备有效期，过期后明确失败且不泄露敏感信息。
4. sidecar 重启后旧 `embed_session` 自动失效。
5. 默认仍为本机监听；LAN 暴露需用户显式开启并看到风险提示。
6. 现有 desktop/CLI 显式 `Authorization` 行为保持兼容。
7. 固定 token 模式关闭时保持当前行为（可随机轮换，不影响现有用户）。
8. 固定 token 模式开启时，跨应用重启生成的访问 URL（含 `auth_token`）保持稳定。
9. 未提供 `OPENCODE_SERVER_PASSWORD` 时，不使用弱默认密码；按优先级链路回退并可观测。

---

## 9. 关联文件（当前已改动）

- `packages/app/src/components/status-popover-body.tsx`
- `packages/app/src/components/settings-general.tsx`（网络配置段）
- `packages/app/src/util/embed-session.ts`
- `packages/app/src/util/server-access-url.ts`
- `packages/app/src/util/server-access-url.test.ts`
- `packages/desktop-electron/src/main/lan.ts`
- `packages/desktop-electron/src/main/sidecar-config.ts`
- `packages/desktop/src-tauri/src/sidecar_config.rs`（LAN 自动选址与 VPN 虚拟网卡规避）
- `packages/opencode/src/server/embed-session.ts`
- `packages/opencode/src/server/middleware.ts`
- `packages/opencode/src/server/middleware.test.ts`
