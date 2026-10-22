# 诊断日志写入类别过滤设计

状态：评审通过，作为实现基线。本方案定义产品行为、配置协议、运行时过滤和验收标准。

## 1. 背景与目标

当前诊断日志会记录任务、处理阶段、模型交互、工具、插件、知识库和上下文等多种事件。完整日志适合故障回放，但用户目前最关注模型请求、模型响应、token、耗时和 provider 数据。每次查看日志都手动使用 `jq` 或 `grep` 过滤，增加了排查成本。

本功能增加一个写入侧事件类别开关，使用户可以选择让诊断文件只记录 LLM 相关事件。过滤发生在诊断事件进入队列之前，因此磁盘上的 JSONL 文件本身就不包含被过滤的业务事件，不需要用户在读取时再次筛选。

首版目标：

- 保持默认行为不变：未配置类别时记录全部现有诊断业务事件。
- 支持选择仅记录 `llm` 类别，覆盖模型请求、模型结果、失败、取消、step usage 和可选 stream chunk。
- 保持 `rawPayloads` 与 `streaming` 的独立语义。
- 配置动态生效，不重启服务，不销毁运行中的会话。
- 不修改已有 JSONL envelope、事件名称、SQLite 对账键或 CLI 读取协议。
- 保留诊断 writer 自身的完整性事件，避免类别过滤掩盖日志丢弃等问题。
- 首版直接支持类别多选，例如仅 `llm` 或 `llm` + `tool`，与持久化配置一一对应，不引入单开关的三态兼容逻辑。

非目标：

- 不提供读取侧默认视图或替代 `diagnostics tail --event` 等查询能力。
- 不删除已经写入的历史文件；切换类别只影响之后新接收的事件。
- 不改变普通运行日志、SQLite 会话转录或遥测上传行为。
- 不根据 trace 关系自动补写被过滤的 `task`、`tool` 或 `context` 事件。

### 1.1 已核实的代码约束

| 事实 | 当前落点 | 设计要求 |
| --- | --- | --- |
| 普通事件汇聚到 `emit()`，丢弃统计自建信封直写实例文件 | `packages/core/src/diagnostic.ts` 的 `emit()` / `flushDrops()` | 业务过滤放在准入处，保留系统完整性信号 |
| `configure()` 用 `current = { ...value }` 整块替换配置 | 同文件 `configure()` | 使用唯一共享配置映射，不能依赖未传字段保留旧值 |
| 两代日志设置均仅在桌面平台显示 | `settings-general.tsx` / `settings-v2/general.tsx` 的 `desktop()` 条件 | 只改桌面日志块，不开放 Web 日志配置或内容 |
| 全局配置更新是深合并或递归 JSONC patch | `packages/opencode/src/config/config.ts` 的 `updateGlobal()` / `patchJsonc()` | 请求中省略字段不代表删除，必须定义真实 unset 操作 |
| 配置和诊断 status 都是公开 HttpApi schema | `packages/opencode/src/server/routes/instance/httpapi/groups/global.ts` | 类型扩展后运行客户端生成，不手改生成文件 |

这些是当前实现事实；下文的类别过滤、共享映射和字段删除契约是拟实施行为，不能混同为已经具备的能力。

## 2. 用户配置

### 2.1 持久化配置

在现有全局配置的 `diagnostics` 块增加可选字段：

```json
{
  "diagnostics": {
    "enabled": true,
    "categories": ["llm"],
    "rawPayloads": true,
    "streaming": false,
    "retentionDays": 14,
    "maxTotalBytes": 2147483648
  }
}
```

首版允许的类别：

| 类别 | 匹配事件 | 说明 |
| --- | --- | --- |
| `task` | `task.*` | 用户任务和父子任务生命周期 |
| `processing` | `processing.*` | WisCode 内部处理阶段 |
| `llm` | `llm.*` | 模型请求、结果、错误、step 和 stream |
| `tool` | `tool.*` | 工具调用和权限结果 |
| `knowledge` | `knowledge.*` | 知识库适配器边界 |
| `plugin` | `plugin.*` | 插件加载和 hook |
| `context` | `context.*` | skill、reference、system context 等上下文来源 |

事件类别由事件名称第一个 `.` 之前的片段决定。事件名称保持开放；未知类别事件在未配置过滤时照常记录，在配置了类别但不在列表中时不记录。

### 2.2 兼容和默认值

- `categories` 未配置：等价于“全部类别”，保持旧配置和旧用户行为不变。
- `categories: ["llm"]`：只接收 LLM 业务事件。
- `categories: ["llm", "tool"]`：接收多个类别，为未来扩展保留能力。
- `categories: []`：配置校验失败，拒绝保存。暂停诊断应使用 `enabled: false`，不能用空数组形成无提示的“没有日志”。
- 不识别的类别值：配置校验失败并返回明确错误，不静默降级为全部或空集。
- 配置字段使用 JSON 数组，而不是单独的 `llmOnly` 布尔值。这样协议只需要增加一次，后续增加工具或任务日志不需要再次迁移配置结构。
- 类别按集合解释，顺序不影响过滤；重复项可在构建运行时集合时去重，不因此重复记录事件。
- “全部”必须表达为字段未配置，不能自动替换为当前七类数组。显式七类数组仍是固定白名单，未来第八类不会自动加入；读取已有这种配置时不得静默改写。
- 持久化配置不接受 `categories: null`。下文请求中的 `null` 只表示字段删除，status 中的 `null` 只表示当前未配置类别，两者均不是新增的文件配置值。

### 2.3 设置页表现

日志设置仍位于通用设置中的日志块，Web 设置页不展示该块，桌面设置页展示。

首版直接提供 checkbox 多选组，标题为“写入事件类别”，包含七个业务类别的中文/英文标签。

- 默认“全部事件”选中，表示不设置 `categories`，也接收未来新增类别。
- 提供“仅大模型”快捷选择，保存 `categories: ["llm"]`；用户不需要逐一取消其他类别。
- 单独勾选多个类别时保存该白名单，例如 `["llm", "tool"]`。
- 切回“全部事件”时执行 §2.4 的字段删除，不写入完整七类数组。
- 未配置时取消其中一个类别，转为其他已选类别的显式白名单。
- 不允许取消最后一个已选类别；控件应给出“至少选择一个类别；停止记录请关闭诊断日志”的本地化提示。API 仍独立拒绝空数组，不能只依赖 UI。
- 读取手工配置时准确显示选中项；显式七类数组显示为固定白名单，“全部事件”不应假装选中。只有用户主动选择“全部”时才删除该字段。
- 修改 raw、streaming 等其他控件时不得改写类别；诊断关闭时保留类别偏好，重新开启继续使用。
- 更新等待中防止重复提交；失败沿用设置页错误提示并恢复服务端状态，不能留下“界面已变但文件未保存”的假象。

说明文案建议：“只将所选类别写入之后的诊断日志；未选类别不会补记。日志系统完整性事件始终保留。历史文件不变。” 选择仅 LLM 时补充：“记录模型交互与指标；任务、工具、插件和知识库边界事件不会写入。”

两代桌面设置页使用同一套配置转换和 i18n 文案。其他语言遵循现有 fallback 规则；不新增日志页面或浏览器 raw 访问能力。

### 2.4 字段删除请求契约

现有 `PATCH /global/config` 采用合并更新。传 `{ "diagnostics": {} }` 或由 JavaScript 序列化掉的 `categories: undefined` 都不能删除已存在的字段。因此“全部 = unset”不能只靠前端省略字段实现。

在现有更新端点增加仅针对 `diagnostics.categories` 的删除标记，不新增端点，不把其他字段的 `null` 改成通用删除操作：

| 更新请求 | 含义 | 持久化结果 |
| --- | --- | --- |
| 省略 `categories` | 保留现值 | 不变 |
| `categories: ["llm"]` | 替换白名单，不拼接旧数组 | 保存 `["llm"]` |
| `categories: null` | 删除类别限制 | 删除该字段 |
| `categories: []` 或未知类别 | 拒绝更新 | 文件和运行时配置均不变 |

例如恢复全部时发送：

```json
{ "diagnostics": { "categories": null } }
```

更新请求 schema 与持久化/读取 schema 分离：请求允许该字段为 `null`；`ConfigV1.Info` 的持久化类别仍只允许非空数组或缺省。全局配置服务消费删除标记，移除对应路径，再校验和写入最终配置。`.json` 和 `.jsonc` 都必须删除真实字段，保留其他配置；JSONC 延续现有注释保留策略。响应返回最终有效配置，不回显删除标记。

删除标记可以与同次更新的 `rawPayloads` 等字段并存。已有全局写入范围限制和配置校验保持不变。此处不顺带改造成通用 JSON Merge Patch，也不扩大项目配置的作用域。

## 3. 运行时过滤语义

### 3.1 过滤位置

过滤唯一放在 Core `DiagnosticTrace.emit()` 的事件准入边界，并且顺序如下：

1. 读取当前配置快照。
2. 检查 `enabled`。
3. 根据事件名计算类别。
4. 若配置了 `categories` 且类别不在集合中，立即返回。
5. 对通过过滤的事件继续执行 streaming 判断、优先级判断、summary 规范化、raw 惰性供应者、入队和落盘。

被过滤的事件必须：

- 不进入队列；
- 不触发 summary 序列化；
- 不调用 `raw` 供应者；
- 不消耗队列容量、seq 或事件落盘空间；
- 不产生 `events_dropped`，因为它不是队列压力导致的丢弃。

过滤发生在事件生产方和 writer 之间，因此不需要修改所有 `llm.ts`、tool、plugin 或 knowledge 调用点的事件名称。类别集合在 `configure()` 时构建并复制，`emit()` 使用内存集合判定，不逐事件读配置文件或重建集合；调用方之后修改原数组不得改变已取得的配置快照。

本功能只保证准入之后不再为被过滤事件执行序列化/raw supplier/入队。调用方在调用 `emit()` 前已经构造的 summary 或其他业务数据并不会被撤销，也不应据此宣称消除了全部事件生产开销。

### 3.2 完整性事件

`diagnostic.events_dropped` 当前由 Core writer 的 `flushDrops()` 直接追加到当天的 `instance.jsonl`，不经过普通 `emit()`。它不是业务事件类别，不受 `categories` 过滤。

这意味着 `categories: ["llm"]` 后：

- 切换后新接收并写入的会话业务事件只包含 `llm.*`；历史行和切换前已入队事件不受影响；
- 正常情况下不会产生 `task`、`tool`、`plugin` 等业务事件；
- 发生队列丢弃、写入异常等情况时，`instance.jsonl` 仍可能出现诊断系统事件；
- 不能承诺整个诊断目录每一行都以 `llm.` 开头，但可以承诺业务事件只属于所选类别。

如果未来增加其他 writer 内部事件，应统一使用 `diagnostic.*` 命名，并继续绕过业务类别过滤。读取器和 formatter 应将这些事件标识为系统事件，而不是误认为 LLM 事件。

### 3.3 LLM 类别内的细分开关

`categories` 与现有 `streaming`、`rawPayloads` 正交：

| categories | streaming | rawPayloads | 结果 |
| --- | --- | --- | --- |
| 未配置 | false | false | 全部业务摘要事件，不含 raw 和 chunk |
| `["llm"]` | false | false | 仅 LLM 摘要事件，不含 chunk 和 raw |
| `["llm"]` | true | false | LLM 摘要事件加 chunk 摘要 |
| `["llm"]` | false | true | LLM 事件加完整请求/响应 raw |
| `["llm"]` | true | true | LLM 事件、chunk 和完整 raw，体积最大 |

`streaming: false` 继续过滤 `llm.stream.chunk`，不能因为选择了 `llm` 而自动开启高频流式记录。

未选择 `llm` 时，`streaming: true` 也不能放行 LLM chunk；`rawPayloads: true` 只给通过类别准入的事件附带原文，不会恢复被过滤类别。LLM 原始请求本身仍可能包含工具定义、工具返回、skill 或知识库注入文本，因为它们确实是模型输入；类别过滤不是请求内容裁剪或脱敏。

### 3.4 动态切换

配置使用当前 `emit()` 调用时的快照：

- 开启类别过滤后，后续新事件立即按新类别判断；
- 关闭类别过滤后，后续新业务事件恢复全量记录；
- 已进入队列的事件按照入队时快照继续完成写入；
- 已被过滤的事件不会补写；
- 不回填历史文件，也不重写已有文件；
- 任何类别切换都不能触发 instance dispose、关闭 session 或取消模型请求。

如果配置更新正好与事件 admission 并发，结果以事件取得配置快照的先后为准，不承诺跨线程的精确边界。该语义与现有 `rawPayloads`、`streaming` 动态配置一致。

同一轮请求可能在切换前写入 started、切换后不写 completed，或相反；这是逐事件快照而非“整轮锁定”的预期行为。只有更新所到达的服务进程使用新快照；本功能不额外承诺其他独立进程即时收到配置变更，也不新增跨进程广播机制。

## 4. 配置传递和接口影响

### 4.1 唯一共享配置映射

保留 `configure()` 的整块替换语义，不改为部分合并。将 handler 内的 `diagnosticConfig()` 迁至 Core，形成可共享的纯函数导出（建议 `DiagnosticTrace.fromConfig(input)`），并与 Core 默认值使用同一来源。输入是已校验的全局 `diagnostics` 配置块，输出是完整运行时 `DiagnosticTrace.Config`。

硬性要求：

- 所有业务 `configure()` 调用必须通过该映射读取全局配置，不允许手写配置字面量或复制默认值。
- 目前八处调用全部迁移：global handler 三处、CLI status/cleanup 两处、plugin 初始化、Legacy SessionPrompt、project-copy 各一处；实施时用全仓搜索再次确认，不能只靠此清单。
- 完整运行时 Config 显式包含 `categories` 字段，其值允许 `undefined`，表示不限制；不因调用方漏传可选属性而静默重置。
- 共享函数留在 Core，不能让 Core 反向依赖 OpenCode handler、Server 或 Client；可接受结构兼容的配置输入类型，不引入依赖 location 的配置服务。
- 映射测试覆盖所有配置字段和默认值，类别包含缺省、LLM、多选、全部重置；结合配置 schema 字段集合与完整 Config 类型进行字段覆盖检查，新增字段未映射必须令测试或类型检查失败，不能只测一次 `categories`。
- 增加调用约束检查：除 Core 服务自身测试的显式构造外，业务 `configure()` 的实参必须来自共享映射；把“禁止散落字面量”变成可验证门禁，而不是文档约定。

### 4.2 status 的稳定表达

CLI `diagnostics status` 与 HTTP `diagnosticsStatus` 都原样表达类别选择，不展开为当前七类集合：

```json
{ "categories": null }
```

表示未配置类别限制；`{ "categories": ["llm"] }` 表示该白名单。已有显式多选或七类白名单按原配置回显。`null` 只是 status 的明确空值，不能用 `undefined` 导致 JSON 输出中字段消失；全局配置 GET 仍按持久化语义省略未配置的字段。

### 4.3 公开类型、生成和实例生命周期

全局配置 schema 增加类别字段；全局更新请求增加 §2.4 的窄范围删除契约；诊断 status schema 增加 nullable 的类别字段。清理/清空端点和 JSONL envelope 均不变，也不新增 endpoint。

“没有新增 endpoint”不等于“无需生成客户端”。现有 `/global/config` 的请求/响应以及 `/global/diagnostics` 的响应都是公开 HttpApi 契约，按仓库要求从 `packages/client` 运行 `bun run generate`；如遗留 SDK 的 schema 输出受影响，同步执行 `./packages/sdk/js/script/build.ts`。生成产物由脚本更新，禁止手工改 `src/generated` 或 `src/generated-effect`。

旧客户端不发送新字段，保持原行为；旧客户端提交其他配置时省略类别必须保留现值。新客户端连接不支持删除标记的旧服务端时应明确报错，不可假装已经恢复全部。

实例销毁判断继续将整个 `diagnostics` 配置排除在外。只改类别或删除类别限制均不 dispose；同时更改非诊断配置仍按既有规则处理。类别过滤不扩展尚未接入诊断的 SessionRunner 业务边界。

## 5. 文件和读取行为

写入过滤不改变 JSONL 文件格式、日期目录、分卷、seq、eventId、trace 关联或 reader 行为。

类别切换后的历史文件可能出现不同阶段的事件集合，例如：

```text
14:00 - categories 未配置：task、llm、tool
14:10 - categories = ["llm"]：llm
14:20 - categories 未配置：task、llm、tool
```

读取器不能根据文件是否只包含 LLM 事件来推断配置状态。`diagnostics status` 负责显示当前配置；历史事件只按实际内容解释。

在 `categories: ["llm"]` 下使用 `--trace` 时，trace 可能缺少 `task.started`、`task.completed` 和工具边界。这是配置选择的预期结果，不应由 reader 自动合成缺失事件。LLM 事件仍保留自身的 `traceId`、`parentTraceId`、`turnId`、`messageId`、`partId` 和 usage，可用于模型交互和 token 对账。

以上关联字段按原事件适用性保留，不要求每条 LLM 事件都具有全部字段；SQLite 逐 step 对账继续使用 `llm.step.completed` 的 assistant messageId、真实 partId 和 step usage，不与 request-role usage 重复累加。

父子任务关联在仅 LLM 模式下依赖子会话 LLM 事件携带的 `parentTraceId`：reader 仍可由 `traceId + parentTraceId` 扩展子链，不得仅依赖已经被过滤的 `task.child.started`。必须通过真实子代理用例验证，不能仅据 reader 的图算法推断生产端一定携带了关联键。被保留期删除的链接仍只提供部分链，不能凭空恢复。

### 5.1 无模型调用时可能没有会话日志文件

仅 LLM 模式下，若会话在首个模型请求之前失败或取消，且该会话没有历史保留日志，不会仅为“会话存在”创建空 `ses_*.jsonl`。因此 SQLite 中存在会话，不代表诊断目录中有该会话的记录。

reader 的具名作用域表示“存在保留的诊断记录”，不是“SQLite 中存在实体”。这种情况下 `tail --session ses_x`（包括 `--follow`）沿用“作用域不存在”的非零退出语义；`--trace` 没有任何保留事件时亦然。不改 reader 去查询数据库，不补写 task 事件，不建立虚构日志文件。

排查步骤是先看 `diagnostics status`：`categories: ["llm"]` 加上“没有任何模型请求”可以解释没有文件；关闭诊断、保留期清理也可能导致没有记录，不能只凭不存在就断言原因。使用指南应说明“诊断记录不存在不等于业务会话不存在”。若未来要改进 CLI 文案，需保留退出码和只读边界。

## 6. 错误处理和安全边界

- 配置 schema 拒绝空数组、未知类别和非字符串类别，并通过现有配置错误路径提示用户。
- 非法 API 更新必须在持久化和 `configure()` 之前被拒绝，保留原文件和当前运行时配置，不静默回退全量。手工破坏配置文件沿用既有配置校验错误流程；本需求不承诺把整个配置加载器改成忽略错误继续运行。诊断准入内部错误仍按现有隔离规则不得击穿业务。
- 类别过滤本身不得抛出业务异常；未知事件名称应能安全取首段。
- `rawPayloads` 的敏感数据语义不变。开启 `categories: ["llm"]` 不代表 raw 会被脱敏，也不代表日志目录可以安全上传。
- 类别过滤不是权限边界。它只决定本地诊断是否写入，不改变模型、工具、插件或知识库的执行权限。
- `diagnostic.events_dropped` 可能暴露被丢弃事件的名称和数量，但不会包含被过滤事件，因为过滤事件不进入丢弃队列。

## 7. 测试与验收矩阵

### Core

1. 默认配置未设置 `categories` 时，`task`、`llm`、`tool` 等不同类别事件均能写入。
2. `categories: ["llm"]` 时，`llm.request.started`、`llm.request.completed`、`llm.request.failed`、`llm.request.cancelled` 和 `llm.step.completed` 写入，`task.started`、`tool.started` 等不写入。
3. 被过滤事件的 summary 不序列化，raw supplier 不执行，队列计数不增加。
4. `streaming: false` 时，即使 `categories: ["llm"]`，`llm.stream.chunk` 仍不写入；开启后才写入。
5. `rawPayloads: false/true` 与 categories 组合符合 §3.3 表格。
6. `diagnostic.events_dropped` 仍能在队列压力测试中写入 `instance.jsonl`，且过滤事件本身不产生 dropped 统计。
7. 空数组、未知类别和非法类型配置被拒绝；未配置类别仍表示全部。
8. 运行中从全部切换到 LLM，再切换回全部，现有 session 不被销毁，切换后事件按新快照写入。
9. 配置变化与 `rawPayloads`、`streaming` 变化同时发生时，所有字段分别生效。
10. 共享映射覆盖 schema 和完整运行时 Config 的全部字段及默认值；新增字段漏映射时测试或类型检查失败。默认缺省、显式多选和七类白名单不被混淆，业务调用约束检查能拦截新增手写 configure 字面量。

### OpenCode / API / CLI

11. 全局配置更新能够保存、读取和真实删除 `categories`；JSON 与 JSONC 两条路径均验证：省略保留、数组替换、`null` 删除、非法值拒绝且文件/当前运行时均不变。其他诊断和非诊断字段保持不变，只改诊断配置不触发 instance dispose。
12. plugin、prompt、project-copy 和 CLI diagnostics 命令不会因新增字段丢失配置或回退到错误默认值。
13. CLI 和 HTTP status 均明确返回 `categories`：未配置为 `null`，已配置原样回显数组，不归一化成七类集合；全局配置 GET 不残留删除标记。旧客户端省略类别时保留已有过滤。
14. CLI tail/show 能读取类别过滤后的文件；过滤不会破坏跨日期、分卷、trace 和 seq 处理。

### 设置页

15. 两代桌面设置页显示类别多选与“全部事件”“仅大模型”快捷操作，中文和英文文案存在，其他语言按项目 fallback 规则工作。
16. 仅 LLM 保存 `["llm"]`，自定义组合准确读写，全部执行真实 unset；显式七类白名单不被假装显示为无限制。最后一项不可取消，更新失败不留下假状态，修改其他开关不改写手工类别。
17. Web 设置页不显示日志配置块，符合当前产品边界。

### 实机验收

18. 在无旧记录的新会话中开启诊断并选择“仅大模型”，执行一次包含模型请求和工具调用的会话：新会话日志只出现 LLM 业务事件，工具事件不出现，LLM step usage 与 SQLite 对账仍成立。
19. 开启 raw payload 后确认 LLM 请求/响应仍完整落盘；关闭 raw 后不出现 raw 字段。
20. 高负载下确认被过滤的非 LLM 事件不会增加日志体积、队列压力或 dropped 统计。
21. 切换开关后继续使用同一会话，确认会话不中断、没有 instance disposed 事件。
22. 仅 LLM 模式下，构造在首个模型请求之前取消或失败的新会话：没有会话诊断文件，`tail --session`（包括 `--follow`）按既有规则非零退出；status 明确返回 `["llm"]`，指南可以解释这与业务会话存在不矛盾。
23. 仅 LLM 模式下执行真实带子代理的任务：父/子 LLM 事件均保留，子事件带 `parentTraceId`；`tail --trace <父任务>` 合并子会话模型事件，且不依赖 `task.child.started` 存在，不扩展 `followsTraceId`。
24. macOS / Windows 桌面分别验证类别保存、恢复全部后配置文件真实无字段、同一会话动态切换，以及打开目录和手动 clear 不回归；Windows 实机在实现完成并同步构建后执行，不以其他平台测试替代。

## 8. 实施顺序

1. 先为类别 schema、共享映射的字段覆盖、writer 过滤和真实字段删除补充失败测试。
2. 增加类别 schema、完整运行时 Config、共享映射和入口集合过滤；保持 configure 整块替换。
3. 所有业务 configure 迁移到共享映射，增加调用约束检查，补齐 status 的 nullable 原样表达。
4. 实现更新请求的字段删除契约、JSON/JSONC 持久化与动态切换回归测试；更新公开 schema 并生成客户端。
5. 增加两代桌面设置页类别多选、中文/英文 i18n 及控件测试；修正使用指南的桌面专属说明，功能落地后再补实际操作指南。
6. 从各包目录运行 Core、OpenCode、App 聚焦测试及 `bun typecheck`，涉及公开生成类型的 Client 等包也执行对应检查；不从仓库根运行测试，不直接调用 tsc。
7. 执行真实模型/工具/子代理链路、无模型日志场景和 macOS / Windows 动态切换验收，明确记录尚未通过的实机项。

不在本需求中处理 `diagnostics show --raw` 大输出管道截断问题。该问题应作为独立 CLI 修复，避免与日志写入范围变更混合提交；但在本需求验收时应确认新类别过滤不会放大或掩盖该问题。

## 9. 评审决策与补充边界

已根据评审定案：

1. 保留 `diagnostic.events_dropped` 豁免，“仅 LLM”仅约束业务事件，系统完整性信号仍可写入实例文件。
2. 首版直接使用类别多选，附“仅大模型”快捷操作，不再实现单个布尔开关的三态兼容。
3. 恢复全部必须 unset 类别字段，而非持久化当前七类数组，保持未来新增类别的自动纳入语义。
4. 拒绝空数组；暂停捕获使用 `enabled: false`。
5. 以共享纯映射收口全部 configure 调用，保持整块替换语义并设置字段覆盖与调用约束门禁。
6. status 明确区分 `null`（未配置）和显式数组；文档及验收覆盖“业务会话存在但无诊断文件”和仅 LLM 子代理 trace 闭包。

代码核对后新增的补充已纳入基线：现有合并 PATCH 不能靠省略字段实现删除，§2.4 为现有端点定义 `categories: null` 的窄范围删除请求。该标记不进入持久化配置；status 的 `null` 则属于响应表达。两者连同新增配置字段涉及公开 HttpApi 类型，§4.3 已纠正“无需生成 SDK”的旧判断。

本轮只修改设计与现有指南的事实性说明。补充契约确认后按 §8 实施；尚未实现或验证类别过滤功能，不将文档验收矩阵当作已通过测试。
