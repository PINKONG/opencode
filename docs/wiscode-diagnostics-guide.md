# WisCode 诊断日志使用指南

本指南面向 WisCode 的使用者，覆盖诊断日志的开启、页面操作、文件查看、命令行查看、事件解读与典型排查场景。命令行部分另有速查手册：[wiscode diagnostics tail 命令参考](/Volumes/EXTENSION/works/morewis/opencode/docs/wiscode-diagnostics-tail.md)。

## 1. 这是什么，能帮你做什么

诊断日志是 WisCode 内置的"行车记录仪"：开启后，每次任务的完整过程——收到了什么指令、组装了什么上下文、向模型发了什么请求、模型返回了什么、每轮花了多少 token 和时间、调用了哪些工具/插件/知识库、在哪一步失败——都会按会话记录在本机日志文件里。

典型用途：

- **token 消耗排查**：哪个任务、哪次模型调用、哪个工具结果把 token 吃掉了；缓存命中为什么掉了。
- **任务耗时分析**：时间花在模型、工具、插件 hook 还是知识库检索；每轮多少、首 token 多久。
- **故障定位**：任务在哪一步失败、provider 报了什么原始错误、重试了几次。
- **行为审计**：模型实际发出的请求长什么样（含插件改写后的最终形态）。

它默认关闭，按需开启；只保存在本机，不上传。

## 2. 三分钟快速开始

```bash
# 1. 打开诊断（桌面设置页，见 §3.1；或直接写全局配置文件）

# 2. 正常使用 WisCode 跑一个任务

# 3. 查看这个任务的完整时间线
wiscode diagnostics tail --limit 50

# 4. 只看 token 消耗
wiscode diagnostics tail --event 'llm.step.completed'
```

## 3. 开启与配置

### 3.1 设置页（仅桌面）

桌面客户端打开 **设置 → 通用 → 日志** 区，包含以下条目。两代桌面设置页均提供该区域；Web 浏览器设置页不显示日志配置块，CLI / 无头环境使用 §3.2 的全局配置文件方式。

| 条目 | 说明 |
| --- | --- |
| **诊断日志**（开关） | "在本机按会话保存详细运行事件，默认关闭。" 打开后立即生效，不需要重启，也不影响正在进行的会话。 |
| **事件类别**（多选） | 控制哪些事件写入文件；“仅大模型”选择 `llm`，“全部事件”删除类别白名单。系统丢弃统计始终记录。 |
| **模型交互内容**（开关） | 保存完整逻辑请求（system、messages、工具定义）及响应（文本、推理、工具调用）。不包含 provider/wire 报文或 HTTP 请求头；正文仍可能包含敏感信息，不会脱敏。 |
| **原始请求与响应**（开关） | "原样保存模型请求和响应内容，可能包含敏感信息并快速占用磁盘。" 打开时会弹出二次确认，明确告知：日志将原样保存对话、私有代码、完整请求头与响应，可能包含 API key 或访问 token，**不会脱敏**。仅在需要排查请求/响应细节时临时开启。 |
| **流式事件**（开关） | "记录 token、阶段和进度等高频流事件。" 默认关闭；分析逐 token 输出节奏时才需要。 |
| **打开诊断目录**（按钮） | 用系统文件管理器打开日志目录。日志只保存在本机，不会自动上传。桌面平台无法打开目录时会提示日志绝对路径；不表示 Web 设置页提供此入口。 |
| **清空诊断日志**（按钮） | "删除全部诊断日志，包括今天的文件"。点击后弹出确认："此操作不可撤销"。完成后提示已删除的文件数；有文件正被写入时会跳过并提示稍后重试。 |

这些设置都是**动态生效**：对新发生的诊断事件生效，不重建当前会话；关闭只停止相应的新记录，**不删除**已有日志。旧服务端不支持模型交互内容时，设置页会明确报错，不会假装保存成功。

### 3.2 配置文件方式

也可以直接在全局配置文件（如 `~/.config/wiscode/wiscode.json`）中写 `diagnostics` 字段：

```json
{
  "diagnostics": {
    "enabled": true,
    "categories": ["llm"],
    "llmContent": true,
    "rawPayloads": false,
    "streaming": false,
    "retentionDays": 14,
    "maxTotalBytes": 2147483648
  }
}
```

| 字段 | 默认 | 含义 |
| --- | --- | --- |
| `enabled` | `false` | 诊断总开关 |
| `categories` | 未配置（全部） | 业务事件族白名单：task、processing、llm、tool、knowledge、plugin、context；空数组不合法，系统丢弃统计不受过滤 |
| `llmContent` | `false` | 在 LLM 请求开始/终止事件中记录完整逻辑交互内容，与 raw 和 streaming 独立 |
| `rawPayloads` | `false` | 记录请求/响应原文（高敏感、高体积，独立于 streaming） |
| `streaming` | `false` | 记录逐 delta 流式事件 |
| `retentionDays` | `14` | 保留天数；超期日志在周期清理时删除 |
| `maxTotalBytes` | 2 GB | 诊断目录总量目标；超限时从最旧开始删（正在写入的当前文件不删，因此 2 GB 是目标而非硬上限） |

### 3.3 推荐配置组合

| 场景 | categories | llmContent | rawPayloads | streaming |
| --- | --- | --- | --- | --- |
| 日常查看精简 LLM 交互（推荐） | `["llm"]` | 开 | 关 | 关 |
| 只看 token / 耗时 / 工具等指标 | 未配置（全部） | 关 | 关 | 关 |
| provider 兼容或 wire 协议排障 | 按需 | 按需 | 开（临时） | 按需 |
| 分析逐 token 输出节奏 | 包含 llm | 按需 | 按需 | 开 |

以上组合均需 `enabled: true`。类别不含 `llm` 时，开启 `llmContent` 或 `streaming` 不会放行 LLM 事件。仅 LLM 模式下，没有发生模型调用的会话可能没有日志文件，`tail --session` 会报告找不到该诊断会话；这不代表业务会话不存在，可用 `status` 检查类别设置。

### 3.4 用命令行确认状态

```bash
wiscode diagnostics status
# {"root":"/Users/you/.local/share/wiscode/log/diagnostics","enabled":true,"llmContent":true,"rawPayloads":false,"categories":["llm"],...}
```

`root` 就是日志目录的绝对路径。

## 4. 日志保存在哪里、长什么样

### 4.1 目录结构

```text
~/.local/share/wiscode/log/diagnostics/
└── 2026-10-21/                  ← UTC 日期目录，一天一个
    ├── instance.jsonl           ← 实例级事件（插件加载等，不属于任何会话）
    ├── ses_abc….jsonl           ← 每个会话一个文件
    └── ses_abc….1.jsonl         ← 单文件 100 MB 后按数字分卷
```

文件是 UTF-8 JSONL：一行一个完整的 JSON 事件。会话跨天会出现在多个日期目录里；查看工具会自动合并，手工分析时注意跨目录拼接。

### 4.2 一行事件的字段

```json
{
  "schema": "wiscode.diagnostic", "schemaVersion": 1,
  "seq": 423,                        ← 本文件内的序号
  "eventId": "evt_ea38ce…",          ← 事件唯一 ID（show 命令用它）
  "event": "llm.step.completed",     ← 事件类型（见 §8）
  "status": "succeeded",             ← started / succeeded / failed / cancelled / dropped
  "timestamp": "2026-10-21T03:13:30.655Z",
  "durationMs": 12900,               ← 生命周期事件的耗时（毫秒）
  "sessionId": "ses_…", "traceId": "trace_…", "turnId": "turn_…",
  "runtime": { "surface": "desktop", "sessionEngine": "legacy-v1" },
  "payload": { "summary": { … }, "raw": { … } }
}
```

- `traceId` 是一次用户任务的 ID；子代理任务用 `parentTraceId` 关联回父任务；同会话内后发的 prompt 用 `followsTraceId` 接续。
- `payload.summary` 总是存在（元数据：数量、耗时、token、状态）；`payload.content` 在 llmContent 开启时承载逻辑请求或响应；`payload.raw` 只在 rawPayloads 开启时才有（provider/wire 原文）。
- 请求和响应分别位于 `llm.request.started` 和对应的 completed/failed/cancelled 事件中，按 traceId、turnId、attempt 配对。每轮请求独立保存完整快照，不依赖历史哈希引用；失败或取消的响应保留已有输出并标记 `complete: false`。
- 内嵌二进制附件在 content 中保存为 `{ type: "binary", bytes, encoding: "base64", data }`，可还原原始字节；URL 引用保持原样，不额外下载资源。
- 关联键 `messageId`（助手消息）、`userMessageId`、`partId` 可与 SQLite 会话数据互相定位（见 §8.4）。

## 5. 页面上能做的操作

设置页日志区提供两个动作（文案见 §3.1）：

- **打开诊断目录**：仅桌面端提供，调起系统文件管理器；无法打开时提示绝对路径。Web 设置页不显示此入口。
- **清空日志**：删除全部（含当天），有二次确认；正被写入的文件会跳过。

注意：**Web 设置页不提供日志配置或查看功能**。日志内容只能通过本机文件或本机 `wiscode` 命令行查看，这是刻意的安全边界（日志可能包含敏感内容，不允许经网页暴露）。

## 6. 命令行查看（主要方式）

### 6.1 `wiscode diagnostics status`

显示开关状态与日志根目录。

### 6.2 `wiscode diagnostics tail` —— 时间线视图

```text
wiscode diagnostics tail [--session ses_ID | --trace trace_ID]
                         [--since RFC3339] [--until RFC3339]
                         [--limit N] [--event GLOB] [--status STATUS]
                         [--follow] [--chunks] [--ids] [--utc]
```

三种视图（不带参数即全局）：

| 视图 | 命令 | 看什么 |
| --- | --- | --- |
| 全局 | `wiscode diagnostics tail` | 这台机器上所有会话 + 实例事件的统一时间线 |
| 会话 | `tail --session ses_…` | 单个会话的完整过程（跨天、跨分卷；不含子代理会话） |
| 任务 | `tail --trace trace_…` | 一次用户任务的完整消耗，**自动包含子代理任务**（跨会话合并） |

输出示例（真实数据风格）：

```text
2026-10-21 11:13:18.023 +08:00 ses_e...slkZt INFO  tool.started     started    name=weather_geocode-address toolKind=mcp
2026-10-21 11:13:18.352 +08:00 ses_e...slkZt INFO  llm.step.completed succeeded  in=97 out=21 cacheRead=20224 reasoning=34 cost=0 step=0 reason=tool-calls
2026-10-21 11:13:18.354 +08:00 ses_e...slkZt INFO  llm.request.completed succeeded 5274ms in=20321 out=55 cacheRead=20224 reasoning=34 cost=0 reason=tool-calls
2026-10-21 11:13:30.662 +08:00 ses_e...slkZt INFO  task.completed  succeeded  30300ms
```

常用参数速记：

- `--event 'llm.*'` / `--status failed`：事件名通配、状态过滤，过滤先于 limit。
- `--since '2026-10-21T09:00:00+08:00'`：必须带时区；`--until` 同理，闭区间。
- `--limit N`：默认最近 100 行（1–10000）。
- `--ids`：行尾附完整 eventId/traceId/source 路径，用于衔接 `show`。
- `--follow`：实时跟随新事件（Ctrl-C 退出）；配合 `--status failed` 可以边跑边盯报错。
- `--chunks`：显示逐 delta 流事件（默认隐藏；只有 kind/index/字节数，无正文）。

**tail 永远不显示日志原文**——一行一个事件的精简摘要。需要原文用 `show`（见 6.4）。

### 6.3 如何获取三种 ID（ses_ID / trace_ID / evt_ID）

`--session`、`--trace` 和 `show` 分别需要会话、任务、事件三种 ID。**万能开关是 `--ids`：任何 `tail` 查询加上它，每行行尾都会输出完整的 `eventId`、`sessionId`、`traceId`**。此外每种 ID 还有更快的直达入口：

| ID | 用在哪 | 获取方式 |
| --- | --- | --- |
| `ses_ID` | `--session` 会话视图 | ① **界面地址栏**：会话页 URL 就是 `/<项目名>/session/ses_…`，直接复制；② **日志文件名**：`ls -t ~/.local/share/wiscode/log/diagnostics/2026-10-21/`，最新的 `ses_….jsonl` 文件名（去掉 `.jsonl`）就是会话 ID；③ `wiscode diagnostics tail --event 'task.started' --ids --limit 3` |
| `trace_ID` | `--trace` 任务视图 | 从目标任务的 `task.started` 行取：`tail --session ses_… --event 'task.started' --ids`，按时间对上任务发起时刻即可锁定；子代理任务看 `task.child.started` 行的 `childTraceId`；任何 `show evt_…` 的输出里也带 `traceId` |
| `evt_ID` | `show` 单事件深查 | 定位到可疑行后，**给同一条 tail 命令加 `--ids`**，复制行尾的 `eventId=evt_…` |

注意：不加 `--ids` 时会话列显示为缩写（`ses_e...21gTi`，前 5 后 5），只能肉眼区分，不能用于查询。

典型动线：**地址栏拿 ses_ID → `tail --session` 加 `--status failed` / `--event` 过滤缩小范围 → 加 `--ids` 拿 evt_ID → `show` 深挖；需要圈定完整任务时取 trace_ID 换 `--trace` 视图**。

### 6.4 `wiscode diagnostics show <eventId>` —— 单事件深查

```bash
wiscode diagnostics show evt_ea38ce…             # 信封 + summary + content 摘要
wiscode diagnostics show evt_ea38ce… --content   # 只输出逻辑 LLM 内容（未脱敏）
wiscode diagnostics show evt_ea38ce… --raw       # 信封 + summary + 原始 provider 数据
```

`--raw` 输出前会有 "may contain secrets" 警告；provider 的 SSE 流式响应会按帧展开为编号 JSON，方便逐帧查看。raw 需要 `rawPayloads` 开启时才有记录。

`--content` 与 `--raw` 互斥；content 不存在时输出 `null`，不能事后补录。内容输出前会在 stderr 提醒包含对话、私有代码和工具参数，仅限本机查看。stdout 是完整 JSON，可直接管道到 `jq`，例如 `wiscode diagnostics show evt_ID --content | jq '.messages'`。逻辑请求是 WisCode 组装后的内容，不等同于 provider 最终 HTTP body；检查后者仍需 raw。

### 6.5 `wiscode diagnostics cleanup --yes` / `clear --yes`

- `cleanup --yes`：按保留期规则清理旧日志（14 天 / 2 GB）。
- `clear --yes`：清空全部（含当天）。两者都需要显式 `--yes`。

## 7. 直接看文件 / jq 配方

日志是标准 JSONL，任何编辑器、`grep`、`jq` 都能用。常用配方：

```bash
DIAG=~/.local/share/wiscode/log/diagnostics

# 列出某会话的所有任务及 traceId（定位任务链用）
jq -r 'select(.event=="task.started") | [.timestamp, .traceId] | @tsv' \
  $DIAG/2026-10-21/ses_xxx.jsonl

# 列出某会话所有失败事件及 eventId（衔接 show 用）
jq -r 'select(.event=="tool.failed") | [.timestamp, .eventId, .summary.name] | @tsv' \
  $DIAG/2026-10-21/ses_xxx.jsonl

# 某会话每次模型调用的 token 明细
jq -c 'select(.event=="llm.step.completed") | {t:.timestamp, in:.payload.summary.usage.inputTokens, out:.payload.summary.usage.outputTokens, cacheRead:.payload.summary.usage.cacheReadInputTokens}' \
  $DIAG/2026-10-21/ses_xxx.jsonl

# 当天全机 token 汇总（只取 step 计费层，避免与 request 层双计）
cat $DIAG/2026-10-21/ses_*.jsonl | jq -s '[.[] | select(.event=="llm.step.completed") | .payload.summary.usage.inputTokens // 0] | add'

# 找出所有失败事件
grep '"status":"failed"' $DIAG/2026-10-21/*.jsonl | head

# 找出失败事件的类型分布
cat $DIAG/2026-10-21/*.jsonl | jq -r 'select(.status=="failed") | .event' | sort | uniq -c

# 提取一个 trace 及其直接子任务的记录（孙代需把子 traceId 一并加入条件；
# 完整传递闭包直接用 wiscode diagnostics tail --trace trace_xxx）
cat $DIAG/*/*.jsonl | jq -c "select(.traceId==\"trace_xxx\" or .parentTraceId==\"trace_xxx\")"

# 看每个任务的完成耗时排行
cat $DIAG/2026-10-21/*.jsonl | jq -s '[.[] | select(.event=="task.completed") | {t:.timestamp, ms:.durationMs, ses:.sessionId}] | sort_by(-.ms) | .[0:10]'
```

## 8. 读懂事件

### 8.1 事件类型总表

| 类别 | 事件 | 说明 |
| --- | --- | --- |
| 任务 | `task.started` / `task.completed` / `task.failed` / `task.cancelled` | 一次用户输入的完整生命周期 |
| 处理阶段 | `processing.phase.started/completed/failed`（phase：context-assembly、model-resolution、permission-check、tool-dispatch、compaction、retry-backoff 等） | WisCode 内部各阶段耗时 |
| 模型调用 | `llm.request.started/completed/failed/cancelled`、`llm.step.completed` | 每次 provider 交互；step 是计费粒度 |
| 流式 | `llm.stream.chunk`（默认隐藏） | 逐 delta 事件 |
| 工具 | `tool.started/completed/failed/cancelled` | 含 builtin / plugin / mcp / provider 四类 |
| 插件 | `plugin.hook.started/completed/failed`、`plugin.loaded` | 每次 hook 的输入输出摘要与耗时 |
| 上下文 | `context.source.loaded` | 实际加载的 skill / 指令 / 环境等上下文来源 |
| 知识库 | `knowledge.query.started/completed/failed` | 经 WisCode 的知识库检索 |
| 系统 | `diagnostic.events_dropped` | 高负载下丢弃事件的统计（写入 instance.jsonl） |

### 8.2 token 字段与两层口径

`usage` 里的字段：`inputTokens` / `outputTokens` / `cacheReadInputTokens` / `cacheWriteInputTokens` / `reasoningTokens` / `totalTokens`。

**重要口径**：`llm.step.completed` 是逐步计费记录（与 SQLite 的 step-finish 一致）；`llm.request.completed` 的 usage 是请求总量。**统计任务总消耗只汇总 step 层**，两层不要相加（无 step 记录的路径才用 request 层）。`inputTokens` 含缓存部分；"真实新输入" ≈ `input - cacheRead - cacheWrite`。`cost` 是按模型定价的估算值，无定价的模型（如部分企业计划模型）恒为 0。

### 8.3 调用来源（querySource）

`llm.request.*` 的 summary 里带 `querySource`：`main`（主对话）、`subagent`（子代理）、`title` / `summary` / `compaction`（系统辅助调用）、`auxiliary`（其他辅助）。排查"隐性消耗"时先按它分组——标题生成、上下文压缩也是真实的 token 消耗。

### 8.4 与 SQLite / stats 对账

- `wiscode stats` 命令提供按模型/项目/天的本地用量统计（读会话数据库）。
- 诊断日志的 step 层 usage 与数据库 `session.tokens_*` 汇总一致；用 `messageId` / `partId` 可以双向定位到具体消息和 part。

## 9. 排查实战

### 9.1 案例：token 消耗异常

```bash
# ① 全局看最近的 step 计费记录，找出 input 异常大的行
wiscode diagnostics tail --event 'llm.step.completed' --limit 30

# ② 锁定可疑会话后，看这个会话的完整节奏（cacheRead 是否掉到 0）
wiscode diagnostics tail --session ses_xxx --event 'llm.*'

#    典型信号：cacheRead=0 且 in=数万 → 缓存未命中（上下文被改写或切换了模型）

# ③ 找出是谁把上下文撑大的：看每次请求的消息条数与上下文来源
wiscode diagnostics tail --session ses_xxx --event 'context.source.loaded'
#    contentBytes 大的来源（如 available-skills、某个 skill）就是嫌疑对象

# ④ 需要看真实请求体时（需 rawPayloads 已开启）：
wiscode diagnostics tail --session ses_xxx --event 'llm.request.completed' --limit 1 --ids
wiscode diagnostics show evt_xxx --raw | less    # 完整请求体，注意含密钥，勿外传
```

### 9.2 案例：任务变慢

```bash
# 边跑边看各阶段耗时
wiscode diagnostics tail --session ses_xxx --follow

# 事后排行：哪个工具最慢
wiscode diagnostics tail --session ses_xxx --event 'tool.completed' --limit 20

# 插件 hook 是否拖慢了每次请求（hook 每次模型调用都会执行）
wiscode diagnostics tail --session ses_xxx --event 'plugin.hook.*'
```

## 10. 日志维护

- 保留策略：默认 14 天 + 总量 2 GB 目标，自动周期清理从最旧删起；正在写入的文件受保护。
- 关闭诊断开关**不删除**历史日志；彻底删除用设置页"清空日志"或 `wiscode diagnostics clear --yes`。
- rawPayloads 开启时体积增长很快（实测约 2 MB/任务），重度排障期实际保留期可能只有数小时到一两天，属预期。

## 11. 安全与隐私

- 日志**只保存在本机**，无任何上传、遥测或远程查看通道。
- `rawPayloads` 开启时，日志包含：完整对话、私有代码、带鉴权头的请求、工具与插件数据。**日志目录应视为敏感数据目录**，分享文件前先确认内容。
- `llmContent` 不记录传输层请求头，但正文仍可包含私有代码、工具参数或用户输入的密钥，不是脱敏功能。每轮完整请求会随历史增长，不承诺固定体积；仍使用既有保留期和容量清理。reader 超过 64 MiB 单行上限会明确报错，不会静默截断。
- `tail` 不投影完整 content/raw；`show --content` 与 `show --raw` 输出未脱敏内容，仅限本机终端使用。summary 也不是脱敏承诺。
- 浏览器页面（含 sidecar 地址访问）不提供任何日志查看能力。

## 12. 性能影响

| 配置 | 对任务的影响 |
| --- | --- |
| 仅 enabled（推荐日常） | 关键路径每事件约 0.02 毫秒，单任务累计约 4 毫秒，可忽略 |
| + llmContent | 保存完整逻辑请求和聚合响应；体积随上下文增长，不创建 wire capture，不记录逐帧数据 |
| + rawPayloads | 每次模型请求增加毫秒级处理与约 2 MB/任务磁盘；内存瞬时双缓冲响应体 |
| + streaming | 事件量增大（每响应数十到数百条），后台 IO 相应增加，仍不阻塞任务 |

写入失败只记系统日志，绝不影响模型、工具与会话业务；高负载下优先丢弃流式细节事件，生命周期与 token 数据始终保留。

## 13. 常见问题

**Q：为什么 tail 里看不到请求/响应原文？**
设计如此。tail 是精简时间线；逻辑交互用 `show <eventId> --content` 查看（需事先开启 llmContent），provider/wire 原文用 `--raw`（需事先开启 rawPayloads）。

**Q：为什么 cost 一直是 0？**
该模型在价格表中无定价（如企业计划模型），费用无法估算；token 数照常准确。

**Q：关掉开关后旧日志还在吗？**
在。关闭只停止记录新事件；历史文件保留至保留期清理或手动清空。

**Q：开启之前跑的任务有日志吗？**
没有。只有开启之后发生的任务才被记录。

**Q：子代理（@general 等）的消耗在哪看？**
子代理是独立会话文件；用 `tail --trace trace_…` 任务视图可把父子合并成一条时间线统计总量。

**Q：多个 WisCode 实例（桌面 + CLI）同时用会冲突吗？**
不会。每个会话独立文件，跨进程写入有文件锁保护；同一台机器的日志都在同一个目录树下。

**Q：日志文件可以直接删吗？**
可以，但推荐用 `wiscode diagnostics clear --yes`——它会跳过正在写入的文件，避免删除到一半产生损坏。

## 14. 命令速查

```bash
wiscode diagnostics status                       # 开关状态 + 日志目录
wiscode diagnostics tail                         # 全局时间线（最近 100 条）
wiscode diagnostics tail --session ses_ID        # 单会话
wiscode diagnostics tail --trace trace_ID        # 单任务（含子代理）
wiscode diagnostics tail --event 'llm.*' --status failed
wiscode diagnostics tail --since 2026-10-21T09:00:00+08:00 --limit 500
wiscode diagnostics tail --follow                # 实时跟随（Ctrl-C 退出）
wiscode diagnostics tail … --ids                 # 输出完整事件 ID
wiscode diagnostics show evt_ID                  # 单事件详情
wiscode diagnostics show evt_ID --content        # 逻辑 LLM 请求/响应（未脱敏）
wiscode diagnostics show evt_ID --raw            # 原始请求/响应（未脱敏）
wiscode diagnostics cleanup --yes                # 按保留期清理
wiscode diagnostics clear --yes                  # 清空全部
```
