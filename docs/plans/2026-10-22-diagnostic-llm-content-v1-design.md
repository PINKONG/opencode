# 诊断日志 LLM 精简交互内容设计

状态：评审通过，作为首版实施基线。目标是让开发人员直接查看精简、完整、与大模型相关的逻辑交互内容。

本稿取代 `2026-10-22-diagnostic-llm-content-design.md` 和 `2026-10-22-diagnostic-log-interaction-layer-design.md`，两份旧稿已移除，不再作为实施依据。

## 1. 背景与目标

当前诊断日志分为两层：

- `summary`：模型、耗时、token、费用、状态和关联键；
- `rawPayloads`：provider 请求、响应、wire exchanges、SSE 内容和其他原始数据。

关闭 `rawPayloads` 后，日志只剩元数据，无法直接看到发送给模型的内容和模型返回的内容。开启 `rawPayloads` 又会混入 provider 转换报文、headers、鉴权信息和大量协议噪音，不适合作为日常 LLM 日志。

本方案增加独立的 `llmContent` 开关，记录**完整的逻辑请求和响应快照**。首版优先保证直接可读性、数据自包含和实现可靠性，不把日志设计成增量存档数据库。

首版目标：

- 记录 WisCode 组装完成后的逻辑 LLM 请求；
- 记录模型返回的文本、推理、工具调用和结束原因；
- 记录失败、取消和部分响应；
- 保持现有 summary、SQLite token 对账、trace 和 raw 行为不变；
- 通过显式 `show --content` 查看完整内容；
- 不记录 provider wire 报文、HTTP headers、鉴权信息或 SSE 原始帧；
- 不增加 Web 日志查看页面，设置仍保持桌面专属。

非目标：

- 不承诺逻辑请求等于 provider 最终 HTTP body；
- 不做消息增量哈希、前缀链、session LRU 或对话回放协议；
- 不新增 `llm.interaction.recorded` 事件；
- 不修改 SQLite schema；
- 不自动上传或脱敏内容。

## 2. 核心取舍

### 2.1 使用现有 LLM 事件

复用：

- `llm.request.started`；
- `llm.request.completed`；
- `llm.request.failed`；
- `llm.request.cancelled`。

不新增 `llm.interaction.recorded`。一次 provider 调用仍然对应现有的开始和终止事件，避免 tail 时间线、统计和 retry 语义出现额外事件层。

### 2.2 每轮完整快照

每轮记录完整的逻辑请求：`system`、全部 `messages` 和 `tools`；终止事件记录完整响应：文本、推理和工具调用。

这样任意一轮都可以单独查看，不依赖前一轮事件、跨日期目录、历史分卷或内存中的哈希状态。代价是长上下文会话的日志增长更快，首版接受该代价，因为本功能首先解决的是“开发人员能直接看懂 LLM 日志”，不是磁盘压缩。

### 2.3 后续优化边界

只有实测证明完整快照导致保留期或使用体验不可接受，才另立 V2 设计，考虑：

- system/tools 的持久化引用；
- 增量消息和可恢复的对话回放；
- 跨分卷的内容 registry；
- 专用交互视图。

V2 不能只用进程内 LRU 或不可验证的 hash 引用，否则手动清空、保留期删除、进程重启和子代理 session 都会产生悬空引用。

## 3. 配置协议

诊断配置增加可选布尔字段：

```json
{
  "diagnostics": {
    "enabled": true,
    "categories": ["llm"],
    "llmContent": true,
    "rawPayloads": false,
    "streaming": false
  }
}
```

### 3.1 字段语义

| 字段 | 默认值 | 语义 |
| --- | --- | --- |
| `enabled` | `false` | 是否接受新的诊断事件 |
| `categories` | 未配置 | 写入哪些事件类别；`["llm"]` 只写 LLM 类事件 |
| `llmContent` | `false` | 是否在现有 LLM 事件中写入逻辑请求/响应内容 |
| `rawPayloads` | `false` | 是否写入 provider/wire 原始数据 |
| `streaming` | `false` | 是否写入 `llm.stream.chunk` 事件 |

`llmContent` 只对 `llm` 类别有作用。若类别过滤不包含 `llm`，即使 `llmContent` 为 `true`，也不写入内容。

### 3.2 开关正交性

| `llmContent` | `rawPayloads` | `streaming` | 结果 |
| --- | --- | --- | --- |
| `false` | `false` | `false` | 现状：summary 元数据 |
| `true` | `false` | `false` | 日常模式：逻辑请求/响应内容 + summary |
| `false` | `true` | `false` | 现有完整 raw 模式 |
| `true` | `true` | `false` | 内容和 raw 同时记录 |
| `true` | `false` | `true` | 内容和 chunk 同时记录 |
| `true` | `true` | `true` | 完整协议排障模式 |

不自动互斥。用户明确同时打开时，允许内容重复，因为两个开关服务不同目的。

### 3.3 推荐配置

日常 LLM 日志：

```text
enabled      = true
categories   = ["llm"]
llmContent   = true
rawPayloads  = false
streaming    = false
```

provider 兼容性或协议排障时，再临时打开 `rawPayloads`。

## 4. 磁盘事件格式

内容写入现有 session JSONL 文件，不新增目录、不新增 sidecar 文件、不新增事件流。内容放在 `payload.content`，与 `payload.summary` 和 `payload.raw` 平级。

`payload.content` 是新的独立字段，不受 `rawPayloads` 开关控制。`payload.raw` 继续只表示 raw provider/wire 数据。

### 4.1 请求开始

当 `llmContent` 开启时，`llm.request.started` 增加：

```json
{
  "event": "llm.request.started",
  "status": "started",
  "traceId": "trace_...",
  "turnId": "turn_...",
  "attempt": 1,
  "payload": {
    "summary": {
      "provider": "openai",
      "model": "gpt-5",
      "querySource": "main",
      "messageId": "msg_...",
      "userMessageId": "msg_...",
      "messageCount": 12,
      "toolCount": 18
    },
    "content": {
      "kind": "request",
      "system": "...",
      "messages": [],
      "tools": []
    }
  }
}
```

`content.kind` 是判别字段，首版取 `request` 或 `response`。

请求内容是 WisCode 在调用 provider 前组装的逻辑内容：

- `system`：系统提示词；
- `messages`：用户、助手、工具调用、工具结果和其他已有内容块；
- `tools`：模型可使用的工具定义，包括名称、描述和输入 schema。

内嵌二进制附件以 `{ type: "binary", bytes, encoding: "base64", data }` 保存，保留可还原的内容；URL 引用仍按原始 URL 记录，不额外下载资源。这一表示仅用于 content，不改变 summary/raw 的既有序列化行为。

这不是 provider 最终 HTTP body。provider 转换、字段映射、headers、鉴权和传输层包装仍属于 raw 层。

### 4.2 成功完成

当请求成功完成时，`llm.request.completed` 增加：

```json
{
  "event": "llm.request.completed",
  "status": "succeeded",
  "durationMs": 17342,
  "payload": {
    "summary": {
      "reason": "stop",
      "usage": {
        "inputTokens": 19584,
        "outputTokens": 36,
        "cacheReadInputTokens": 0
      }
    },
    "content": {
      "kind": "response",
      "text": "...",
      "reasoning": "...",
      "toolCalls": [
        {
          "id": "call_1",
          "name": "bash",
          "input": {}
        }
      ],
      "finishReason": "stop",
      "complete": true
    }
  }
}
```

请求和响应通过已有的 `traceId`、`turnId`、`attempt`、session 文件内顺序，以及 `payload.summary` 中的 `messageId` / `userMessageId` 配对。完成事件不重复写完整 request。

### 4.3 失败和取消

失败或取消事件记录已经产生的部分响应：

```json
{
  "event": "llm.request.failed",
  "status": "failed",
  "payload": {
    "summary": {
      "error": {
        "name": "ProviderError",
        "message": "...",
        "retryable": true
      }
    },
    "content": {
      "kind": "response",
      "text": "...partial output...",
      "reasoning": "...partial reasoning...",
      "toolCalls": [],
      "complete": false
    }
  }
}
```

请求内容已经由对应的 `started` 事件记录，因此终止事件不重复写 request。必须覆盖：首响应前失败、部分响应后失败、用户取消、stream 无 finish 和自动重试。每次 retry 是独立事件，使用 `attempt` 区分。

### 4.4 Streaming 边界

`llmContent` 开启时，即使 `streaming` 关闭，也要在终止事件中聚合完整文本、推理和工具调用。

`streaming` 只控制额外的 `llm.stream.chunk` 事件：

- `streaming: false` 不影响最终 response content；
- `streaming: true` 才记录逐 delta 内容；
- `llmContent` 不为每个 delta 单独追加内容事件。

## 5. 与 rawPayloads 的边界

### 5.1 llmContent 记录

- system prompt；
- 完整逻辑 messages；
- tools 定义；
- 模型文本；
- reasoning；
- tool calls；
- finish reason；
- 错误和部分响应。

### 5.2 rawPayloads 记录

保持现有语义：

- `wiscodeRequest`；
- `providerRequest`；
- `providerResponse`；
- `providerExchanges`；
- `normalizedResponse`；
- provider metadata、headers 和 wire/SSE 数据。

`llmContent` 不创建 wire capture，也不等待 provider exchange。只有 `rawPayloads` 为 `true` 时才启用现有 wire 捕获。

内容层不是脱敏层。内容可能包含用户输入、私有代码、工具参数、工具结果和模型输出，日志目录仍视为本机敏感数据目录。

## 6. V1 实施边界

当前 V1 主路径已有采集位置：

- `packages/opencode/src/session/llm.ts` 的输入包含 `system`、`messages`、`tools`；
- stream 观察逻辑可以累积 text、reasoning 和 tool calls；
- finish 事件提供 usage 和 finish reason；
- processor 在 `step-finish` 后拥有真实 `partId` 和 token 对账信息。

实施要求：

1. Core 和全局配置 schema 增加可选 `llmContent`，缺失时为 `false`。
2. `DiagnosticTrace.Config` 与 `fromConfig()` 同步增加字段，并保持字段覆盖门禁。
3. `llm.request.started` 在开关开启时写入 request content。
4. stream 观察逻辑只在需要时累积 response content；不得因为 `llmContent` 开启而创建 wire capture。
5. 成功、失败和取消路径写入 response content；写入失败不得阻断模型调用或 session。
6. `rawPayloads` 继续独立控制 `payload.raw` 和 wire capture。
7. `streaming` 继续独立控制 `llm.stream.chunk`。
8. 不修改 SQLite 表结构和 usage/cost 对账口径。
9. 所有内容使用现有诊断队列、Flock、分卷和清理机制。

内容层记录的是逻辑请求，不是 provider 最终 wire 请求。需要核对 provider 实际 body 时，仍须开启 `rawPayloads`。

## 7. 设置页、CLI 和 SDK

### 7.1 设置页

在现有桌面端诊断日志块增加“模型交互内容”开关。说明：

> 记录发送给模型的逻辑请求，以及模型返回的文本、推理和工具调用。不包含 provider 原始报文或鉴权请求头。

保存行为与现有诊断开关一致：动态生效、不销毁运行中的 session、保存中禁用控件、修改其他开关时保留原值。旧服务端不支持字段时，客户端必须明确提示，不能静默显示成功。Web 页面不显示该配置。

### 7.2 CLI status

`wiscode diagnostics status` 增加：

```json
{
  "enabled": true,
  "categories": ["llm"],
  "llmContent": true,
  "rawPayloads": false,
  "streaming": false
}
```

### 7.3 CLI show

现有 `show` 行为需要显式区分三种输出：

```bash
# 事件 envelope、summary 和简短 content 摘要
wiscode diagnostics show <event-id>

# 完整逻辑 LLM 内容
wiscode diagnostics show <event-id> --content

# 完整 provider/wire raw 内容
wiscode diagnostics show <event-id> --raw
```

默认 `show` 不直接倾倒完整 system、tools 或长 response，只显示事件信息和 content 摘要。`--content` 只输出 `payload.content`（不存在时为 `null`），不混入 raw；`--raw` 保持既有 envelope + summary + raw 投影，不混入 content。两个选项互斥。

`--content` 输出前必须提示内容可能包含对话正文、私有代码和工具参数，仅应在本机查看；`--raw` 保留现有的敏感数据警告。

完整内容输出必须等待 stdout 排空，不能使用可能在大管道输出时截断的异步 console 写法。需要增加大内容通过 pipe、重定向文件和 Windows 环境的回归测试。

### 7.4 SDK

由于 diagnostics status 和全局配置属于公开 HttpApi：

- 修改 public protocol 或 server schema 后重新生成客户端；
- 按仓库规则运行 `packages/client` 的生成命令；
- 按遗留 SDK 规则运行 `./packages/sdk/js/script/build.ts`；
- 禁止手工编辑生成文件；
- 验证旧客户端 `global.config.update({ config })` 调用形状保持兼容。

## 8. 体积和保留策略

本功能不是磁盘压缩功能，但完整逻辑快照会影响日志体积，必须可观测。实施阶段需用真实 fixture 和真实会话分别测量：

- 首轮请求；
- 长上下文多轮请求；
- 工具密集请求；
- 大型工具结果；
- compaction 前后；
- title、summary、subagent 等辅助调用。

设计目标是常规会话中日志可长期使用，不能把未经测量的 `15KB/轮` 或 `100KB/10轮` 写成协议硬上限。首版不截断 system、messages、tools 或 response；如果实测体积影响 14 天/2GB 保留策略，另立 V2 做可持久化引用和回放设计。

不截断不代表没有单行保护：现有 reader 的 64 MiB 单行上限是唯一大小保护。超过上限的记录由 reader 拒绝并报告错误，不得静默截断或以部分 JSON 呈现；首版不增加更低的 content 专属限制。

## 9. 兼容性与安全

- 缺失 `llmContent` 等价于 `false`；
- 旧日志没有 `payload.content`，reader、tail、show 和 clear 按现有格式工作；
- `categories: ["llm"]` 仍只过滤事件类别；
- `rawPayloads` 行为保持不变；
- 不迁移历史日志；
- 不修改 SQLite schema；
- 不改变 `llm.step.completed` 的 usage/cost 对账口径；
- 子代理内容留在子 session 文件，通过 `parentTraceId` 和 trace 查询关联；
- 内容写入失败不得阻断业务；
- 内容不进入 telemetry、错误收集或其他外发链路；
- 开关不是权限边界，不改变模型或工具执行权限。

## 10. 测试与验收矩阵

### 10.1 Core、配置和 API

1. `llmContent` 缺省时不写入 `payload.content`。
2. 开启后配置映射、动态切换和 writer 行为正确。
3. 新字段纳入 fromConfig 字段覆盖门禁。
4. 只改 diagnostics 配置不销毁 session。
5. HTTP/CLI status 返回实际 `llmContent` 值。
6. 旧服务端忽略字段时设置页明确报错。

### 10.2 LLM 事件

7. `llm.request.started` 包含完整逻辑 request content。
8. 成功终止事件包含 text、reasoning、tool calls、finish reason 和 `complete: true`。
9. 首响应前失败包含 request 事件和错误。
10. 部分响应失败或取消保留已有输出并标记 `complete: false`。
11. stream 无 finish 有明确失败事件。
12. retry 的每次请求独立，`attempt` 正确。
13. `main`、`subagent`、`title`、`summary`、`compaction`、`auxiliary` 的 `querySource` 正确。
14. 子代理内容可通过 parent/child trace 关联。

### 10.3 正交性与回归

15. `llmContent: true, rawPayloads: false` 没有 provider raw/exchanges。
16. `llmContent: false, rawPayloads: true` 保持既有 raw 行为。
17. `streaming: false` 没有 chunk，但终止事件仍有完整 response content。
18. `streaming: true` 时 chunk 与 response content 可同时存在。
19. 未选择 `llm` 类别时不写入 content。
20. content 与 raw 同开时两套数据各自符合定义。
21. SQLite token 对账与开启前一致。
22. content 写入失败不阻断模型调用。

### 10.4 CLI 与实机

23. `show` 默认输出摘要，`show --content` 输出完整 content 并先显示敏感数据提示，`show --raw` 只输出 raw。
24. 大 raw/content 通过 pipe 和重定向文件均完整、合法 JSON；超过 reader 的 64 MiB 单行上限时明确报错而非截断。
25. 混合旧日志和新日志时 tail/show/filter/clear 不回归。
26. macOS 与 Windows 设置页可切换并真实生效。
27. 真实多轮、工具调用、title 和子代理场景中内容与 UI 交互一致；体积数据被记录为观测结果，不以未经验证的固定数字判定失败。

## 11. 实施顺序

1. 增加 Core/config 字段、fromConfig 映射和配置测试。
2. 为 LLM request/response/failed/cancelled 增加 content payload 及门控测试。
3. 单独修复现有 `show --raw` 的 stdout 排空问题，增加大 raw 经 pipe 和重定向的回归测试；作为独立提交，不夹带 `--content` 功能。
4. 增加 `show --content` 投影、敏感数据提示和对应测试；使用已修复的 stdout 排空路径，作为独立功能提交。
5. 更新 HTTP status/OpenAPI，重新生成 client 和 legacy SDK。
6. 修改两代桌面设置页，补齐 i18n 和旧服务端错误处理。
7. 更新诊断指南，包含推荐配置、content/raw 边界和敏感数据说明。
8. 运行 Core、OpenCode、App、SDK typecheck 与聚焦测试。
9. 完成 macOS/Windows 实机验证和真实会话观测。

## 12. 明确不纳入首版的 V2 方向

以下内容需要在首版真实使用后再单独设计：

- system/tools 的哈希引用；
- 增量 messages 和可恢复的对话重建；
- 跨日期、分卷和清理边界的 content registry；
- `tail --interactions` 或专用对话浏览器；
- 内容压缩、去重和保留期专项优化。

V2 必须先解决引用生命周期和清理一致性，不能只在内存中保存哈希状态。
