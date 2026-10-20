# WisCode 全流程会话诊断日志设计

状态：评审通过，作为实现基线。本文只定义产品行为、事件协议、存储和验收标准，不包含实现代码。

## 1. 背景与目标

WisCode 当前已有面向开发者的普通运行日志，但它主要记录服务自身的告警和错误，无法回答性能分析所需的问题：一次用户任务从哪里开始、组装了什么上下文、向模型发送了什么、模型返回了什么、每轮耗时和 token 是多少、调用了哪些工具/技能/插件、是否访问了知识库、最终在哪个阶段结束或失败。

本功能提供一个全局诊断开关。开启后，WisCode 在本机以 JSONL 追加写入会话级诊断轨迹，目标是支持插件性能问题和端到端任务耗时分析。

首版目标：

- 记录一次任务从接收、上下文准备、模型请求、流式响应、工具执行到结束的完整可观测生命周期。
- 在 `rawPayloads` 显式开启时，原样记录模型请求和响应，包括请求头、请求体、响应体及插件改写后的实际数据。用户已经明确接受本机日志可能包含 API key、token、对话、私有代码和其他敏感数据。
- 记录每轮模型交互的耗时、首 token 时间、流式耗时、重试次数和 token usage。
- 保留与现有 SQLite 会话转录的关联键，让诊断事件和现有 `step-finish`/part token 记录可以互相定位；JSONL 保存完整诊断轨迹，SQLite 继续承担会话查询和产品运行数据。
- 记录实际发现和调用的 skill、工具、插件 hook、MCP 调用和 WisCode 可观测的知识库调用。
- 本次支持当前 OpenCode v1 实际使用的 Legacy `SessionPrompt` 会话路径；诊断协议为未来 `SessionRunner` 迁移保留兼容字段，但不在本次实现中接入新的 session 运行时。
- 日志写入失败不能阻断模型、工具、插件或会话业务。
- 支持按日期检索、按会话聚合、按 trace/turn/tool call 关联和离线性能分析。

非目标：

- 不上传日志，不提供远程日志平台，不在首版实现日志查看器或复杂查询语言。
- 不记录模型不可见的隐藏思维链。模型实际返回的 reasoning、分析字段或 provider metadata 可以按原样记录，但不能声称这是模型完整思考过程。
- 不臆造外部插件、MCP server 或知识库内部发生的动作。只记录 WisCode 经过的调用边界和它收到的结果。
- 不用诊断日志替代现有普通日志。普通日志继续承担启动、系统级错误和低级故障输出。

## 2. 产品开关与用户提示

诊断配置属于服务端全局配置，不能只放在浏览器 local storage 中。CLI、Web、桌面、ACP 和后台会话必须读取同一份配置。

建议配置结构：

```json
{
  "diagnostics": {
    "enabled": false,
    "rawPayloads": false,
    "streaming": false,
    "retentionDays": 14,
    "maxTotalBytes": 2147483648
  }
}
```

字段语义：

- `enabled`：是否接收新的诊断事件，默认 `false`。
- `rawPayloads`：是否记录原始内容 payload，默认 `false`。关闭时只保留结构、标识、大小/数量、耗时、token 和错误元数据；开启后原样记录用户/模型正文、完整 provider 请求响应、headers/body、工具与插件输入输出、上下文内容，不做脱敏。这是独立于流式记录的高敏感、高体积选项。
- `streaming`：是否记录每个文本、reasoning 和工具输入 delta，默认 `false`。关闭时仍记录请求开始、请求元数据、最终响应摘要、usage、工具调用和错误；是否记录完整请求/响应由 `rawPayloads` 决定。
- `retentionDays`：保留天数，默认 14 天。值为 0 时不按天数保留，但仍受总量上限约束；具体是否允许 0 由配置 schema 决定，不能解释为“永不删除”。
- `maxTotalBytes`：诊断目录总量上限，默认 2 GB。

设置页首版提供：

1. 启用全局诊断日志。
2. 保存完整模型请求和响应（高敏感、高体积）。
3. 记录流式响应详情。
4. 打开日志目录。
5. 立即清理。

启用诊断时必须显著提示日志会保存在本机。启用 `rawPayloads` 时还要明确提示：用户/模型正文、完整请求头和响应可能包含 API key、访问 token、私有代码及其他敏感信息；工具、插件、MCP、知识库和上下文内容也会原样记录，且不做脱敏。还应提示 raw payload 会显著增加日志体积，重度使用时实际保留期可能只有数小时至一两天，仍受总量上限约束。用户关闭开关后不删除历史日志；“立即清理”需要二次确认。

配置动态生效，不要求重启服务，不销毁当前会话：

- 从关闭切换为开启：后续新事件立即进入诊断写入器。
- 从开启切换为关闭：停止接收新事件，已经进入队列的事件允许完成 drain，然后关闭对应 writer。
- 配置读取失败：按关闭处理，并通过现有普通日志记录一次配置错误。

## 3. 存储布局与文件协议

诊断日志使用 `Global.Path.log` 下的独立目录，不混入现有 `opencode.log`：

```text
<Global.Path.log>/diagnostics/
└── 2026-10-20/
    ├── instance.jsonl
    ├── ses_abc.jsonl
    ├── ses_abc.jsonl.1
    ├── ses_def.jsonl
    └── ...
```

规则：

- UTC 日期目录，一天一个目录。
- 没有 session 归属的实例级事件写入当天的 `instance.jsonl`，包括插件加载、诊断 writer 丢弃统计和配置/实例生命周期事件；它们不伪造 `sessionId`。
- 每个会话一个基础文件，文件名使用安全的 `sessionId` 编码，不能直接拼接未经校验的用户输入。
- 单个 session 文件或 `instance.jsonl` 达到 100 MB 后分卷为 `.1`、`.2`，数字递增。分卷之间共享同一个日志流。
- `seq` 在所有分卷之间持续递增，不因换卷归零。
- 文件使用 UTF-8 JSONL，一行一个完整 JSON 对象，以换行结尾。
- 事件对象写入采用单次 append；业务不依赖跨行事务。
- 进程崩溃或强制终止后，最后一行可能不完整。读取端忽略最后一个无法解析的尾行，不修改、不自动修复历史文件。
- 写入端下一次追加到同一流时，可在持有该流锁的情况下将不完整尾行截断至最后一个换行；这不改变读取端的只读行为。完整但损坏的行不得静默跳过。
- 同一会话的事件由同一 writer 串行写入；不同会话可以并行。

每条记录统一使用如下信封：

```json
{
  "schema": "wiscode.diagnostic",
  "schemaVersion": 1,
  "seq": 42,
  "eventId": "evt_xxx",
  "event": "llm.request.completed",
  "status": "succeeded",
  "timestamp": "2026-10-20T14:32:01.123Z",
  "monotonicMs": 184223.7,
  "durationMs": 12840,
  "sessionId": "ses_xxx",
  "traceId": "trace_xxx",
  "parentTraceId": "trace_parent_xxx",
  "followsTraceId": "trace_active_xxx",
  "turnId": "turn_xxx",
  "toolCallId": "call_xxx",
  "parentEventId": "evt_previous",
  "location": {
    "directory": "/work/project",
    "workspaceID": "optional"
  },
  "runtime": {
    "version": "1.20.0",
    "pid": 12345,
    "surface": "web",
    "sessionEngine": "legacy-v1"
  },
  "payload": {}
}
```

字段约定：

- `schema`、`schemaVersion`：跨版本解析的协议标识。
- `seq`：单个日志流的写入顺序。每个 session 文件和每日 `instance.jsonl` 各自单调递增；由于有界队列可能丢弃低优先级事件，序号允许出现空洞。
- `eventId`：全局唯一事件 ID。
- `status`：`started`、`succeeded`、`failed`、`cancelled` 或 `dropped`。
- `timestamp`：UTC ISO 8601 时间。
- `monotonicMs`：进程单调时钟，用于性能分析，不能作为跨进程的绝对时间。
- `durationMs`：生命周期结束事件使用开始事件到结束事件的单调时钟耗时。
- `sessionId`：整个会话的关联键。实例级事件省略此字段。
- `sessionId`、`traceId`、`parentTraceId`、`followsTraceId`、`turnId`、`toolCallId`、`durationMs` 和 `parentEventId` 均可选。实例级事件没有 `sessionId`；尚未建立任务、父子任务、模型轮次或工具调用时，相应关联键省略；瞬时事件没有 `durationMs`；没有父事件时省略 `parentEventId`。
- `traceId`：当前 session 内一次用户任务，从输入被接受直到任务结束的关联键。
- `parentTraceId`：跨 session 的父任务关联键。子 agent/task 创建独立 session 时，子 session 的事件仍写入子 session 文件，但携带父任务的 `traceId` 作为 `parentTraceId`；普通任务不设置该字段。
- `followsTraceId`：同一 session 中，一个在已有 runLoop 运行期间被 admitted 的新 prompt 所属的新 trace，指向它接续的活跃 trace。它不同于 `parentTraceId`，不表示子 session。
- `turnId`：一次 provider 模型请求/重试尝试所属的模型轮次。
- `toolCallId`：一次模型工具调用或本地工具执行的关联键。
- `parentEventId`：用于构建调用树。缺失时表示该事件是当前 trace 的根事件。
- `parentTraceId`/`followsTraceId`：分别用于表示跨 session 父子任务关系和同 session prompt 接续关系；普通事件省略。
- `location`：项目目录和可选 workspace；路径按原样记录。
- `runtime.surface`：`cli`、`web`、`desktop`、`acp` 或 `background`。
- `runtime.sessionEngine`：当前为 `legacy-v1`；未来 `SessionRunner` 迁移后使用 `session-v2`。它与入口 surface 是两个独立维度。
- `payload`：事件类型专属数据。未知字段读取端必须保留并忽略，不因新增字段失败。

所有时长单位为毫秒，token 复用 `@opencode-ai/llm` 现有 `Usage` 语义，不能另造一套会造成统计不一致的 token 定义。

## 4. 事件模型

### 4.1 任务生命周期

```text
task.started
  -> processing.phase.*
  -> context.source.loaded
  -> llm.request.*
  -> tool.* / plugin.hook.* / knowledge.query.*
  -> processing.phase.*
  -> task.completed | task.failed | task.cancelled
```

`task.started` 在用户输入已被接受、服务端生成 `traceId` 后写入。若输入在 admission 阶段就被拒绝，也必须尽可能写入 `task.failed`，并标明 `stage: admission`。`task.completed` 表示该 trace 达到正常稳定状态，不等同于某一个 provider chunk 到达。

每个被 admitted 的 prompt 都创建自己的 `traceId`。如果 prompt 到达时 Legacy `SessionPrompt` 的 runLoop 正在运行并加入当前循环，则新 trace 通过 `followsTraceId` 指向当时活跃的 trace；不能把多个用户输入合并成一个 trace。

任务 payload 至少包含：

```json
{
  "input": {
    "text": "rawPayloads 开启时的原始用户输入；关闭时为长度/数量摘要",
    "attachments": []
  },
  "agent": "build",
  "model": "provider/model",
  "delivery": "prompt",
  "surface": "web"
}
```

失败和取消事件至少包含 `stage`、标准化错误对象和 provider 原始错误（如果存在）。

### 4.2 内部处理阶段

为了回答“WisCode 本身做了什么”，首版记录阶段级事件，而不是对每个函数或局部变量打日志。事件名称为：

- `processing.phase.started`
- `processing.phase.completed`
- `processing.phase.failed`

`payload.phase` 使用受控枚举，例如：

- `admission`
- `context-assembly`
- `system-context`
- `skill-resolution`
- `reference-resolution`
- `model-resolution`
- `prompt-build`
- `permission-check`
- `compaction`
- `tool-dispatch`
- `retry-backoff`
- `persistence`
- `session-settlement`

阶段 payload 包含阶段名、输入/输出摘要、项目内数量统计和错误；原始内容是否记录由具体阶段边界决定。模型请求正文不应被阶段摘要替代，必须由 LLM 事件单独保存。

### 4.3 模型请求与响应

每次 provider 交互至少产生 `llm.request.started` 和一个终结事件：`llm.request.completed`、`llm.request.failed` 或 `llm.request.cancelled`。重试必须有新的 `turnId` 或明确的 `attempt`，不能覆盖之前的请求。

完成事件 payload：

```json
{
  "attempt": 1,
  "provider": "anthropic",
  "model": "claude-...",
  "route": "messages",
  "protocol": "anthropic-messages",
  "operation": "chat",
  "querySource": "main",
  "messageId": "msg_xxx",
  "partId": "prt_xxx",
  "genAi": {
    "system": "anthropic",
    "requestModel": "claude-...",
    "operationName": "chat"
  },
  "wiscodeRequest": {},
  "providerRequest": {
    "url": "...",
    "headers": {},
    "body": {}
  },
  "providerResponse": {},
  "normalizedResponse": {
    "text": "...",
    "reasoning": "...",
    "toolCalls": []
  },
  "usage": {
    "inputTokens": 1000,
    "outputTokens": 300,
    "nonCachedInputTokens": 900,
    "cacheReadInputTokens": 100,
    "cacheWriteInputTokens": 0,
    "reasoningTokens": 80,
    "totalTokens": 1300,
    "providerMetadata": {}
  },
  "timing": {
    "queueMs": 10,
    "prepareMs": 20,
    "timeToFirstTokenMs": 600,
    "streamMs": 12000,
    "parseMs": 5
  },
  "retry": {
    "count": 0
  }
}
```

字段语义：

- `wiscodeRequest`：Core 组装的规范请求。`rawPayloads: true` 时包含完整 system、messages、tools 和请求选项；关闭时只保留 agent/model、消息数量、工具数量、字节数、上下文摘要和其他性能分析所需元数据。
- `providerRequest`：仅在 `rawPayloads: true` 时记录协议适配、鉴权、插件 hook 和其他转换完成后实际发送的完整数据。这里可能包含完整 URL、headers 和 body，是性能与插件问题定位的关键；关闭时只保留请求元数据和大小/耗时摘要。
- `providerResponse`：仅在 `rawPayloads: true` 时记录 provider 原始响应或原始流聚合结果；关闭时保留解析后的响应摘要。
- `normalizedResponse`：WisCode 解析后的响应。`rawPayloads: true` 时包含文本、provider 返回的 reasoning 和完整 tool call 参数；关闭时只保留文本/参数长度、数量、finish reason 和类型摘要。
- `usage`：复用现有 LLM `Usage` 字段及 provider metadata。
- `usage.cost` 可选记录现有 `getUsage` 定价计算得到的估算费用，例如 `{ "amount": 0.0123, "currency": "USD", "estimated": true }`。它必须注明币种和是否为估算值，不能把不同 provider 的价格直接混算；没有价格信息时省略。
- `timing`：能测量的阶段才记录，不可测量字段为 `null` 或省略，不能填估算值。
- `querySource`：调用来源，至少支持 `main`、`subagent`、`auxiliary`、`title`、`summary` 和 `compaction`，用于区分主对话、子代理和系统辅助调用。`retry` 不是来源值；重试保持原来源，并通过 `attempt` 和 `retry.count` 表达。`summary` 专指 `SessionSummary.summarize` 等摘要生成调用，不并入 `auxiliary`。
- `messageId`、`partId`：可选关联键，用于连接诊断日志与现有 SQLite 会话转录及 token 统计。
- `genAi`：与 OpenTelemetry GenAI 语义约定兼容的字段映射。首版不要求导出 OTel，但字段命名和 token 语义应保持可映射。

默认模式不记录原始正文，也不记录每个 stream delta。`rawPayloads: true` 时记录完整对话内容、provider request/response、工具和上下文 payload；关闭时只保留摘要、耗时、usage 和状态。`streaming: true` 时，追加逐 delta 事件；若 `rawPayloads` 关闭，chunk 只记录长度、kind 和时序，不记录文本正文。

- `llm.stream.chunk`：文本、reasoning、工具输入 delta 及 provider metadata。
- chunk 事件必须包含 `index`、`kind`、`content` 和相对 `turnId` 的时间。
- 队列满时优先丢弃 chunk，不丢弃请求开始、终结、错误、工具调用和任务生命周期事件。

模型的隐藏思维链不可从 WisCode 侧保证可见；只有 provider 实际返回的 reasoning 字段才可以记录。

`payload.phase` 的枚举是可扩展集合，不是封闭协议。新增阶段名不属于 schema breaking change，读取端必须保留并展示未知阶段；已有阶段的语义不能无公告地改变。

`rawPayloads` 的开关语义与 `streaming` 分离：性能分析通常只需要结构摘要、usage 和 timing；需要查看对话正文、provider 适配或插件改写时才开启完整原始 payload。设置改变后只影响新事件，不回填旧事件，也不修改已经写入的记录。

### 4.4 Skill、工具与权限

Skill 发现和加载记录：

- `context.source.loaded`：skill、reference、system context 等上下文来源实际被加载时记录。
- `payload.sourceKind`：`skill`、`reference`、`system`、`agent` 等。
- `payload.sourceId`：名称、路径或稳定标识。
- `payload.content`：`rawPayloads: true` 时的原始内容；关闭时使用 `contentBytes`、`itemCount`、来源标识和其他摘要。LLM 请求的完整 system/messages 仅在 `rawPayloads` 开启时记录。
- `rawPayloads` 开启时，上下文来源的完整内容也会写入；关闭时只记录来源标识、路径、大小和数量，避免普通诊断模式保存正文。

工具生命周期：

- `tool.started`
- `tool.completed`
- `tool.failed`
- `tool.cancelled`

工具 payload 至少包含：

```json
{
  "toolKind": "builtin|plugin|mcp|provider",
  "name": "...",
  "pluginId": "optional",
  "input": {},
  "output": {},
  "permission": {
    "requested": true,
    "decision": "allow|deny|ask|provider-executed"
  }
}
```

工具事件必须在实际执行边界记录，而不是只在模型返回 tool call 时记录。这样可以区分模型请求了工具、工具被权限拒绝、工具真正运行、工具执行失败和 provider 代执行工具。

工具的 `input`、`output` 在 `rawPayloads: true` 时保存完整内容；关闭时替换为参数/结果大小、类型、数量、耗时和状态摘要。

### 4.5 插件、MCP 与知识库

插件：

- `plugin.loaded`：插件发现、加载成功或加载失败。
- `plugin.hook.started`
- `plugin.hook.completed`
- `plugin.hook.failed`

插件 payload 包含 `pluginId`、插件来源、hook 名称、输入、输出、耗时和错误。`rawPayloads: true` 时输入输出为完整内容；关闭时仅记录大小、类型和状态摘要。只有经过 WisCode plugin host 的 hook 才能保证被记录；插件自行启动的后台任务不在首版完整承诺内。

MCP 调用在 WisCode 能识别的 transport/tool 边界记录为 `toolKind: "mcp"`，并保留 server、method、request、response 和耗时。`rawPayloads: true` 时保存完整 request/response；关闭时仅保存 server、method、大小、状态和耗时。MCP server 内部继续调用了什么，除非它通过响应返回，否则不记录。

知识库：

- `knowledge.query.started`
- `knowledge.query.completed`
- `knowledge.query.failed`

payload 包含 `provider`、`query`、`filters`、`hits`、返回内容、耗时和错误。`rawPayloads: true` 时保存 query、filters、hits 和返回内容；关闭时仅保存 provider、查询/返回数量、大小、耗时和状态摘要。若同一次检索同时经过 MCP transport/tool 层和知识库 adapter 层，两层事件必须通过 `parentEventId` 关联；聚合 token、耗时和调用次数时按调用树去重，不能把 transport 层和业务 adapter 层当成两次独立检索。MaxKB、MCP、插件等只有在调用经过 WisCode 可观测边界时才会出现；“模型可能使用了某个知识”不能单独生成知识库事件。

## 5. 当前 OpenCode v1 覆盖与未来 SessionRunner 迁移

这里的“OpenCode v1”指当前产品版本的实际运行链路，不等同于内部运行时名称。当前产品主链路是 Legacy `SessionPrompt`/session 路径，本次实现只接入这条路径，并覆盖上下文组装、模型请求、工具结算、重试、取消和最终任务状态。

内部的 `SessionRunner` 是未来的 session 运行时路径，不属于本次实施范围。本次只要求诊断协议、事件字段和 Core `DiagnosticTrace` 服务不绑定 Legacy 调用细节，使未来迁移可以通过适配层复用同一协议。未来接入后，事件使用 `runtime.sessionEngine: "session-v2"`；本次所有 Legacy 事件使用 `runtime.sessionEngine: "legacy-v1"`。

当前实现接入点按以下顺序确定：

1. Legacy `SessionPrompt` admission / prompt 入口：创建 trace 和 task 生命周期。
2. LLM client/stream 边界：统一采集规范请求、实际 provider 请求、响应和 usage。Legacy 主路径基于 AI SDK 时，`providerRequest`/`providerResponse` 必须通过注入 AI SDK 的 recording `fetch` 捕获；native runtime 路径则接入 `packages/llm` 的 transport 层。recording fetch 必须通过 `Request.clone()`/`Response.clone()` 或等价机制读取副本，不能消费或缓冲原始流而改变请求、响应时序或内存行为。仅记录 `LLMRequestPrep` 或 normalized response 不满足 wire-level 验收。
3. Tool registry 与 provider-executed tool 结算边界：统一工具生命周期。
4. Plugin host、MCP transport 和知识库 adapter：记录跨边界输入输出。
5. `SessionPrompt` 内部阶段：补充上下文组装、权限、压缩、重试和 settlement 等路径特有信息。

未来 `SessionRunner` 迁移时，复用前四类共享边界和事件协议，另行增加 `SessionRunner` 入口及其阶段适配，不把本次 Legacy 实现中的内部函数名写入稳定协议。

task 工具创建的子 agent 使用独立 session。子 session 事件照常写入自己的 `ses_*.jsonl`，同时携带父任务的 `parentTraceId`；task 工具的 started/completed 事件必须记录 `parentTraceId`、`childTraceId`、父子 session ID 和调用关系，便于从父任务完整展开子任务耗时与 token。

所有服务端产生的会话表面统一记录：Web、CLI、桌面、ACP 和后台。`runtime.surface` 只标明入口，不改变事件协议。若某个入口不经过统一 Session/LLM/Tool 边界，必须在实现验收中明确标记为不支持，而不能宣称全覆盖。

## 6. 写入架构

Core 提供唯一的 `DiagnosticTrace` 服务，业务代码不直接操作文件。服务职责包括：配置判断、ID/关联上下文、事件 envelope、队列、按 session 路由、分卷、flush、清理和失败降级。

所有关联上下文必须通过函数参数或显式 trace/turn context 传递。不得退化为全局单例中的可变当前 trace，也不得使用 `AsyncLocalStorage` 等隐式 ambient context；V1 的工具执行和 plugin hook 运行在 AI SDK 的普通 JavaScript 回调中，显式传递才能避免并发 session 或子 agent 串写日志。

推荐使用异步、有界队列：

- 每个 session 维护串行写入顺序。
- 不同 session 可以并行写入。
- 默认每约 100 ms 或积累 64 条事件 flush 一次。
- task、LLM request、tool 和 plugin hook 的终结事件触发立即 flush。
- 业务调用只把事件放入队列，不等待磁盘 flush。
- 队列容量必须有限，不能因为模型高速输出无限占内存。
- 队列满时按优先级丢弃：先丢 stream chunk，再丢低优先级阶段摘要；生命周期、终结、错误和 dropped 统计优先保留。
- 一批事件发生丢弃后，写入 `diagnostic.events_dropped`，包含事件类型计数、时间范围和丢弃原因。
- 写文件、建目录、换卷或清理失败只写普通日志 `diagnostic writer failed`，禁止诊断 writer 递归记录自身错误。
- 不无限重试；单次失败可有限重试，之后丢弃并释放队列。

`DiagnosticTrace` 提供最少以下能力：

```text
startTask(input) -> trace context
startTurn(context, request) -> turn context
emit(context, event, payload)
complete(context, status, payload)
flush(sessionId?)
close(sessionId?)
```

业务代码不需要知道日志路径、分卷编号或当前配置。所有终结事件使用 `complete` 类语义，保证 start/end 的关联信息一致。

## 7. 清理、并发与可靠性

保留策略同时受两项限制：默认 14 天和诊断目录 2 GB，总是先删除更旧的日志，直到两个限制都满足。

- 启动时执行一次轻量清理。
- 新会话开始前可触发轻量清理，但不能阻塞任务启动。
- 设置页“立即清理”执行完整清理，并在前端二次确认。
- 清理按日期目录和文件修改时间排序，优先删除最旧的已关闭分卷。
- 当前正在写入的文件不得删除；writer 需要持有 session lock 或等价保护。
- 清理失败不影响模型、工具和插件业务，普通日志记录失败路径和原因。
- 清理完成后保留 `diagnostics/` 根目录，便于后续继续写入。
- 写入器需要处理两个并发 writer 不应同时创建/切换同一 session 文件的情况。单进程内由 session map 串行化；跨进程场景使用现有文件锁或原子创建约束。

诊断开关关闭时不删除历史文件，也不启动无意义的后台扫描。开启或新会话触发清理时，清理任务应有时间/文件数量边界，避免一次操作长时间占用事件循环。

## 8. 读取与运维体验

首版不实现复杂日志查看器，但必须让用户能找到文件：

- CLI 在执行“打开日志目录”或诊断状态命令时输出绝对路径。
- Web/Desktop 调用系统默认文件管理器打开诊断根目录；无法打开时显示绝对路径和明确错误。
- 日志文件可以被普通文本工具、`jq`、脚本和标准 JSONL 工具读取。
- 读取工具按日期、session 文件和分卷顺序合并；分卷必须按数字卷号排序（`.2` 在 `.10` 之前），不能使用字典序；忽略文件末尾不完整行；遇到中间损坏行需报告文件、行号和错误，不静默吞掉整份文件。
- `schemaVersion` 升级时保留向后读取能力，新增事件类型不应让旧读取器崩溃。

## 9. 错误对象与安全边界

所有失败事件中的标准化错误至少包含：

```json
{
  "name": "ErrorName",
  "message": "error message",
  "stack": "optional stack",
  "retryable": false,
  "stage": "provider|tool|plugin|knowledge|persistence",
  "providerError": {}
}
```

错误字段不做脱敏，因为本功能明确采用原样诊断策略。但实现不能把原样记录误解为可以无边界记录任何进程内对象：必须保证 JSONL 可序列化，循环引用、不可序列化值、超出文件协议的 binary 值需要使用现有稳定表示；不能因为序列化一个异常 payload 让业务失败。

原样保存意味着日志目录应视为敏感数据目录。设置页、文档和打开目录入口都必须明确这一点。首版不做脱敏、上传、共享链接或远程收集；这些能力必须另行评审。

## 10. 测试与验收矩阵

### 基础链路

1. 开关关闭时执行纯文本任务：不生成诊断事件，普通业务不受影响。
2. 仅开启诊断而关闭 `rawPayloads` 时执行纯文本模型请求：存在 task started/completed、processing 阶段、LLM started/completed；请求摘要、响应摘要、normalized response、usage、duration 和 trace 关联正确，完整 headers/body 不落盘。
3. 多轮 tool call：每轮模型请求、每个 tool call、权限决策、工具输出和最终任务完成都可按 `traceId`、`turnId`、`toolCallId` 串起来；创建 subagent/task 时，父任务和子 session 通过 `parentTraceId`、`childTraceId` 及父子 session ID 串起来。
4. skill/reference/system context 加载：加载的来源、数量、路径/标识和实际进入请求的内容可追溯。
5. plugin hook、MCP tool 和知识库 query：成功、失败、拒绝和取消都有终结事件，输入输出与耗时正确。

### 当前 Legacy 链路和入口

6. Legacy `SessionPrompt` 完成上述基础链路，事件包含 `runtime.sessionEngine: "legacy-v1"`。
7. Web、CLI、桌面、ACP 和后台分别通过当前实际 session 路径启动任务，`runtime.surface` 正确且使用同一事件协议。
8. 未来 `SessionRunner` 适配测试不属于本次门禁；迁移时必须复用同一基础链路用例，并将 `runtime.sessionEngine` 改为 `"session-v2"`。

### 异常与性能

9. provider retry：每次尝试可区分，重试退避耗时和最终失败原因正确。
10. provider error、权限拒绝、工具异常、用户取消、进程中断：均生成对应 failed/cancelled 事件，业务状态与日志状态一致。
11. 开启 `rawPayloads` 后执行模型请求：完整规范请求、provider headers/body、原始响应和插件改写后的数据原样落盘；关闭后重新执行不回填旧记录。
12. `streaming: true`：能读到 chunk；人为填满队列时优先丢弃 chunk，并生成 `diagnostic.events_dropped`；关键终结事件仍存在。
13. 写磁盘失败、目录不可写、JSON 序列化异常：普通日志有错误，模型/工具任务仍可完成或按原有业务错误结束。
14. 同一 session 事件顺序稳定，不同 session 可并行；session 和 `instance.jsonl` 各自的 `seq` 跨分卷递增。
15. 100 MB 分卷、日期目录、最后损坏尾行、文件中间损坏行的读写行为符合协议。
16. 同一 session 内诊断日志按 `querySource` 聚合的 token usage 与现有 SQLite `session.tokens_*` 统计一致；若有定价信息，`usage.cost` 与现有 `getUsage` 计算一致。
17. 诊断目录不会被现有上报、错误收集、遥测或 console 转发链路读取或上传；诊断日志只保存在本机，除用户主动打开目录外没有外发路径。
18. 实例级插件加载、配置错误和 writer 丢弃事件写入当日 `instance.jsonl` 且不伪造 session/trace 字段；任务运行期间新 admitted prompt 获得独立 `traceId` 并正确记录 `followsTraceId`。

### 配置与清理

19. 动态开启/关闭 `enabled`、`rawPayloads` 和 `streaming` 不需要重启；关闭只停止对应新数据，不删除历史文件。
20. 默认 14 天和 2 GB 限制清理最旧日志，不删除正在写入文件。
21. 设置页立即清理需要二次确认，完成后保留诊断根目录；清理失败不影响任务。
22. CLI/Web/Desktop 的“打开日志目录”行为正确，输出或展示绝对路径。

测试运行要求：新增代码所在 package 的聚焦测试、`bun typecheck`、设置页相关测试、CLI/Server 接口测试，以及至少一次真实 provider/工具链路的端到端测试。涉及公共 Protocol 或 Server `HttpApi` 时，必须从 `packages/client` 执行 `bun run generate`，不能手改生成文件。

## 11. 实施顺序

实施时按以下顺序拆分，避免先做 UI 再发现事件协议无法承载：

1. 固化 schema、envelope、关联 ID、错误对象和 JSONL writer 测试。
2. 实现 Core `DiagnosticTrace`、有界队列、分卷、清理和动态配置。
3. 在共享 LLM/Tool/Plugin/MCP/knowledge 边界接入，建立 Legacy `SessionPrompt` 可复用的底座日志。
4. 接入 Legacy `SessionPrompt` 入口和阶段级事件，覆盖当前产品的完整主链路。
5. 接入全局配置 API、设置页开关、清理和打开目录入口。
6. 补 CLI、Web、桌面、ACP、后台的表面标识与端到端验收。
7. 做性能、磁盘故障、并发、分卷和长流式响应测试，再进行人工验证。

未来 `SessionRunner` 迁移时，新增单独的诊断适配层和对应端到端门禁；不得在本次实现中提前混接两套 session 编排，避免事件归属、任务边界和失败语义不清。

首版不承诺实时日志流 UI，也不承诺在任务完成前让业务线程等待所有日志落盘；保证的是事件进入有界 writer 后尽力持久化，关键终结事件优先级高于流式细节。

## 12. 已确认边界

本设计已采用以下已确认决策：全局开关、默认关闭、`rawPayloads` 独立且默认关闭、开启后原样写入、按天目录、单会话 JSONL 加实例级 `instance.jsonl`、100 MB 分卷、异步有界队列、默认 14 天和 2 GB 上限、失败不阻断业务、关闭开关不删除历史日志、设置页立即清理。raw payload 启用时实际保留期可能因体积显著缩短。

评审已确认：

- Legacy `SessionPrompt` 是当前 OpenCode v1 的首阶段接入路径，并标记 `runtime.sessionEngine: "legacy-v1"`。
- 诊断协议保持稳定，未来 `SessionRunner` 通过新增适配层接入，不改已有事件语义。
- `rawPayloads` 默认关闭且独立于 `streaming`；显式开启后原样保留 provider 请求和响应，满足隐私提示与性能分析边界。
- `streaming` 默认关闭；开启后允许丢弃 chunk，但保留生命周期和终结事件。
- `querySource`（包括独立的 `summary` 来源）、SQLite `messageId/partId`、可选费用和 OTel GenAI 兼容字段属于首版协议。
- 内部处理采用受控阶段事件，不产生无限制 debug 行，满足插件性能问题定位需要。
- 知识库、插件、MCP 只记录 WisCode 可观测边界；不可见的内部动作不作虚构记录。
- 2 GB 总量上限和 14 天保留期作为首版默认值。

评审已通过；首阶段实施见 [诊断日志基础能力实现计划](2026-10-20-diagnostic-trace-implementation-plan.md)，后续接入按本设计的阶段顺序推进。
