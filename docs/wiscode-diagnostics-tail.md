# wiscode diagnostics tail 使用文档

`wiscode diagnostics tail` 是 WisCode 诊断日志的只读 CLI 视图：把本地 JSONL 诊断轨迹渲染成接近传统应用日志的单行时间线，用于端到端任务分析、插件/工具耗时分析和 token 消耗排查。它只读取、从不修改或删除任何诊断文件。

配套设计文档：

- [诊断日志设计](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-10-20-diagnostic-trace-design.md)
- [日志视图设计](/Volumes/EXTENSION/works/morewis/opencode/docs/plans/2026-10-20-diagnostic-log-views-design.md)

## 1. 前置条件

- 读取的是诊断日志根目录（`wiscode diagnostics status` 输出的 `root`，通常为 `~/.local/share/wiscode/log/diagnostics`）下保留期内的文件。
- **读取本身不要求诊断开关处于开启状态**：开关关闭后历史文件仍在，随时可以查看；只有在事件发生时开关是开启的，才会有记录可读。
- 日志按 UTC 日期目录组织：`<root>/YYYY-MM-DD/ses_*.jsonl`（每会话一个流）、`instance.jsonl`（实例级事件），单文件 100 MB 后按数字分卷（`ses_xxx.1.jsonl`、`.2`、…）。tail 自动跨日期、跨分卷合并。

## 2. 命令语法

```text
wiscode diagnostics tail [--session ses_ID | --trace trace_ID]
                         [--since RFC3339] [--until RFC3339]
                         [--limit N] [--event GLOB] [--status STATUS]
                         [--follow] [--chunks] [--ids] [--utc]
```

约束：`--session` 与 `--trace` 互斥；`--follow` 与 `--until` 互斥。不带作用域参数即全局视图。

## 3. 三种作用域

### 3.1 全局视图（默认）

合并保留期内**所有**会话流与 `instance.jsonl`，按事件时间戳升序输出最近 N 条匹配行。这是"这台机器上刚发生了什么"的机器级时间线。

- 同毫秒事件的稳定排序：时间戳 → 流（日期/文件名/卷号）→ seq → eventId。`eventId` 是递减计数器生成的，**不是时间序**，仅作最后的确定性平局键，不能当因果序解读。
- 为保证"最近 N 条"精确，每次运行都会扫描保留期内的全部候选文件（不按 mtime 剪枝），冷扫描大目录较慢；stderr 会显示进度行（仅 TTY）。

### 3.2 会话视图（`--session ses_ID`）

只看指定会话，自动跨 UTC 日期和数字分卷合并，按**记录顺序**（日期 → 卷号 → seq）输出，即还原写入时的流顺序。

- 不包含子代理会话（子代理是独立 session，用 trace 视图看）；不包含实例级事件。
- 会话内时钟回拨时，显示的墙钟时间可能倒退，属预期行为。
- 事件信封中的 `sessionId` 会与请求的 ID 再次校验，文件名匹配但内容不属于该会话的记录不会出现。

### 3.3 任务视图（`--trace trace_ID`）

沿 `parentTraceId` 传递闭包展开跨会话的子代理任务：父任务的工具事件和子任务的 LLM/token 事件合并到一条时间线，是从"一次用户任务"视角统计总消耗（含子代理）的正确方式。

- `followsTraceId`（同一会话中后续 admitted prompt 的接续关系）**不会**被展开，如需查看请显式指定那个 trace。
- 部分链场景：根 trace 记录已过期/被清理但子链存活时照常显示子链，并输出 stderr 警告；声明的子链接找不到任何保留记录时同样警告。根和全部子链都不存在时按"作用域不存在"处理（非零退出）。
- 链接构建遍不受 `--since`/`--until`/事件过滤影响（避免老链接因时间过滤凭空消失），过滤只作用于显示行。

## 4. 参数参考

| 参数 | 取值 | 说明 |
| --- | --- | --- |
| `--session` | `ses_` 前缀 ID | 会话视图，见 §3.2。格式非法直接报错。 |
| `--trace` | `trace_` 前缀 ID | 任务视图，见 §3.3。 |
| `--since` / `--until` | RFC3339 | 必须带时区（`Z` 或 `±HH:MM`），毫秒精度**闭区间**；会做日历合法性校验（如 2 月 30 日、25:00 都会拒绝）。过滤作用于事件时间戳，不作用于目录名。 |
| `--limit` | 1–10000，默认 100 | 输出最近 N 条**可见**行。所有过滤（含 chunk 隐藏）先于 limit 生效。 |
| `--event` | glob | 事件名匹配，`*` 是唯一通配符，如 `llm.*`、`tool.*`、`task.started`。含其他通配符字符（`?`、`[`、`]`）会被拒绝。 |
| `--status` | `started` / `succeeded` / `failed` / `cancelled` / `dropped` | 精确匹配事件的 status 字段。 |
| `--follow` | 开关 | 实时跟随，见 §6。不能与 `--until` 同用；`--since` 同时过滤初始快照与新增行。 |
| `--chunks` | 开关 | 显示 `llm.stream.chunk` 逐 delta 事件。默认隐藏（几百个 chunk 会淹没生命周期事件）；仍只有 kind/index/字节数，无正文。 |
| `--ids` | 开关 | 行尾追加完整 `eventId` / `sessionId` / `traceId` / `turnId` / `source`，用于衔接 `show` 和脚本处理。 |
| `--utc` | 开关 | 时间列用 UTC（`2026-10-20 10:00:00.000Z` 形式）。默认本地时区带数字偏移（`2026-10-20 18:00:00.000 +08:00`）。 |

## 5. 输出行格式

每行一个事件，从左到右：

```text
2026-10-21 11:13:36.900 +08:00  ses_abc...lkZt  INFO   llm.step.completed    succeeded   12900ms  in=28051 out=93 cacheRead=0 cost=0.012 step=0 reason=stop
│                              │                │      │                      │           │        │
时间（本地+偏移或 --utc）        会话缩写/(inst)  级别    事件名                  状态        耗时     事件族摘要
```

- **会话列**：超过 13 字符缩写为 `前5...后5`；实例级事件显示 `(inst)`。
- **级别**：由 status 派生的显示字段，不写回日志：`failed` → ERROR、`cancelled`/`dropped` → WARN、其余 → INFO。当前版本为纯文本，无 ANSI 着色。
- **耗时**：仅生命周期终结事件携带（`durationMs`）。
- **摘要**：按事件族提取关键字段，常见族如下；未识别的新事件名回退为前几个 summary 键值对。

| 事件族 | 摘要字段 |
| --- | --- |
| `llm.step.completed` | token 细项在前：`in` `out` `cacheRead` `cacheWrite` `reasoning` `cost`，随后 `step` `reason` |
| `llm.request.started` | `provider` `model` `querySource` `attempt` `messageCount` `toolCount` |
| `llm.request.completed` | token 细项在前，随后 `reason` `querySource` `attempt` |
| `llm.request.failed` | 走通用回退：只显示标量字段（如 `provider` `model` `attempt`）；嵌套的错误对象不进入单行，详情用 `show` 查看 |
| `tool.*` | `name` `toolKind` `stage`（失败时） |
| `task.*` | `agent` `model` `childTraceId`（子任务链接时） |
| `plugin.*` / `knowledge.*` / `context.*` / `processing.phase.*` | 标识、动作、数量/大小、耗时 |

- **token 口径**：`llm.step.completed` 是逐步计费记录（与 SQLite `step-finish` part 对账用这一层）；`llm.request.completed` 是请求总量。**两层不能相加**——统计任务总消耗时只汇总 step 层；无逐步记录的路径（如 native runtime）才用 request 层。单行不显示 `usageRole` 标记，按事件名区分即可。
- **`--ids` 附加**：行尾追加 ` eventId=… sessionId=… traceId=… turnId=… source=<文件路径>`，其中 source 直接给出事件所在文件。
- 行宽超出终端列宽（无终端信息时 160 列）截断加 `...`；`--ids` 行不截断；完整字段用 `show` 查看。

## 6. `--follow` 实时跟随

```bash
wiscode diagnostics tail --follow [--session … | --trace …] [过滤参数]
```

- 先输出初始快照（同非 follow 语义，受 `--limit` 限制），随后持续输出新增的**完整行**；半行（尚未写完换行）会等补全后才显示。
- 实现为文件观察 + 1 秒周期轮询双保险；文件观察不可用时轮询兜底。
- 会发现新会话文件、数字分卷、跨 UTC 日的新目录。
- trace 模式下，运行期间新出现的子任务链接会**自动回填**该子任务已落盘的历史记录。
- `Ctrl-C` 正常退出（退出码 0）。
- 检测到文件身份变化、截断或同尺寸重写时，会从新代数的偏移 0 继续读取，并向 stderr 输出 `Diagnostic stream reset`；在外部就地重写等竞争下，前缀行可能重放，这是优先避免吞日志的 best-effort 语义。

## 7. 退出码

| 场景 | 退出码 |
| --- | --- |
| 正常输出；作用域存在但过滤后为空（打印 `No diagnostic events match the filters.`）；无作用域且根目录为空 | 0 |
| `--session`/`--trace` 指定的 ID 在保留期内无任何记录（含 `--follow`） | 非 0 |
| 参数非法（ID/时间/glob/limit/互斥冲突） | 非 0 |
| IO 失败、中间损坏行（输出含文件与行号）、单行超过 64 MiB 上限 | 非 0 |

扫描中文件被并发清理（删除）属预期竞态：打一条 partial 警告到 stderr，继续扫描其余文件，正常退出。

## 8. 配套命令

```bash
wiscode diagnostics status             # 诊断开关状态 + 日志根目录
wiscode diagnostics show evt_ID        # 单事件：envelope + summary 美化缩进输出
wiscode diagnostics show evt_ID --raw  # 追加原始 payload；provider SSE 响应按帧展开为编号 JSON
wiscode diagnostics cleanup --yes      # 按保留期（14 天 / 2 GB 目标）清理旧日志
wiscode diagnostics clear --yes        # 清空全部诊断日志（含当天）
```

`tail` 永远不输出原始正文（请求/响应体、密钥、对话内容不会出现在单行摘要里）；查看原文的唯一入口是 `show --raw`，其输出**未脱敏**，可能包含 API key、访问 token 和私有代码，仅限本地终端使用。

## 9. 典型工作流

```bash
# 1. token 消耗排查主路径：某会话的逐步计费 token 细项（含缓存读写）
wiscode diagnostics tail --session ses_xxx --event 'llm.step.completed'

# 2. 一次任务的完整消耗（自动展开子代理），并拿到可回查的事件 ID
wiscode diagnostics tail --trace trace_xxx --event 'llm.*' --ids

# 3. 定位到可疑调用后，展开当时的真实 wire 请求/响应（SSE 逐帧）
wiscode diagnostics show evt_xxx --raw

# 4. 只盯失败，边跑会话边看
wiscode diagnostics tail --follow --status failed

# 5. 时间窗内某模型的全部交互
wiscode diagnostics tail --since 2026-10-21T09:00:00+08:00 --until 2026-10-21T12:00:00+08:00 \
                         --event 'llm.request.completed'

# 6. 机器全局时间线（含实例级 plugin 加载等）
wiscode diagnostics tail
```

## 10. 性能与成本说明

- 全局/trace 视图为保证"最近 N 条"精确，需流式扫描保留期内全部文件（默认上限约 2 GB，活跃卷可能更多；trace 构建链接遍需要第二遍扫描）。内存有界：只保留 N 条紧凑投影，raw payload 读到即弃。
- 每行解析有 64 MiB 安全上限（rawPayloads 开启时单行可能很大），超限显式报错，绝不截断成看似正常的事件。
- 长扫描在 TTY stderr 显示限频进度行；重定向时静默。

## 11. 安全边界

- 读取器只访问诊断根目录，拒绝符号链接与无关文件；`--session`/`--trace`/eventId 是过滤器，永远不当作文件路径拼接。
- stdout 只有记录行；警告、进度、错误走 stderr，便于管道使用。
- 本命令不上传任何数据；诊断目录整体应视为敏感数据目录。

## 12. 已知限制

- 快照读取与清理/替换不是事务：并发变化的文件按 best-effort 单遍读取，可能遗漏该文件中的记录，但不把不完整尾行或畸形行当作有效事件。
- `--follow` 检测到流重置后会从新代数重新读取；外部并发改写仍可能导致前缀行重放，stderr 会提示重置。
- Windows 实机（读取、clear 并发、文件观察）尚未验证。
