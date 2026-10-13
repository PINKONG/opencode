# WisCode 内嵌 BMAD-METHOD 设计评审稿

状态：评审通过，实施中，待桌面产物与 Windows 实机验证。首个 BMAD 快照来自本地 `main` 的提交 `bda3c5929f672019b90f39a3ea27259d35d00974`，版本 `6.13.0-next`。这不是永久锁定；每次升级可重新选择当时的 `main` HEAD，但每份 WisCode 发行物必须固定到具体提交，不能在运行时跟随浮动分支。

## 目标与边界

用户安装 WisCode 后，无需自行执行 `npx skills add`、安装 BMAD 或安装 uv，即可在工作目录通过 `/bmad-init` 初始化 BMAD。平台固定为 WisCode/OpenCode，不出现平台选择。

- `/bmad-init`：快速模式。按产品默认的技能集合和 BMAD 给出的默认配置完成初始化，不提问。若缺少默认答案，或涉及删除、迁移、覆盖用户内容，则停止并报告原因。
- `/bmad-init --interactive`：完整模式。先询问产品选项和 BMAD 原生配置问题，再按答案初始化。删除、迁移需单独明确确认，不能由“交互模式”自动授权。
- 重跑同一命令用于修复或更新项目。BMAD 的升级随 WisCode 发版，项目文件不在应用启动时静默更新。

非目标：本轮不承诺完全离线的首次运行，不开发 BMAD 配置 UI，不重写上游 `setup.py`，不接管用户自行安装的 BMAD，也不自动清理旧布局。商标审查按当前决策暂不处理；版权和许可证必须保留。

## 已核实事实

- BMAD `main` 的 `skills/` 包含 `bmad`、`bmod-core-tools`、`bmod-method`、`bmod-toolsmith` 等。`bmad/scripts/setup.py` 接受 `--project-root`、`--skill`、重复的 `--root`、`--status`、`--list-config-questions`、`--module-answers`，并输出 JSON。
- 普通 setup 调用可能移动 `_bmad/custom/` 中被重命名的定制文件。因此仅仅不传 `--remove-retired` 并不等于没有迁移副作用，必须先检查状态并执行确认策略。
- V1 命令在 `packages/opencode/src/command/index.ts`，V2 命令在 `packages/core/src/plugin/command.ts`。两者当前都是提示词模板，不是原生文件操作处理器；V1/V2 技能发现都有缓存。V1 已扫描 `.agents/skills`；当前 V2 仅从配置目录和显式路径加载技能，实施时必须补上 `.agents/skills` 的发现。
- 桌面 macOS/Windows 脚本先编译 `wiscode-cli`，再将它复制到 `packages/desktop/resources`。`packages/desktop/electron-builder.config.ts` 的 `extraResources` 尚不包含 BMAD/uv。桌面 sidecar 从 `packages/desktop/src/main/server.ts` 继承环境。
- BMAD 技能文本使用 `uv run ...`。只让初始化器知道 uv 的绝对路径是不够的；后续 agent shell 的 PATH 也必须包含内嵌 uv。V2 bash 工具目前尚未实现 `shell.env` hook，不能以该 hook 为接入前提。

## 推荐架构

采用“固定快照资产 + 确定性初始化器 + 薄命令入口”。BMAD 技能内容原则上按来源快照分发；若必须修正上游脚本的本地更新指引，以独立、可审查的最小补丁记录，不直接改写大量技能提示词。TypeScript 初始化器负责预检、文件同步、运行 BMAD `setup.py`、所有权记录和结构化结果。`/bmad-init` 负责收集意图和答案，调用同一个初始化器；不让模型自行 `cp`、修改 TOML、决定哪些文件可覆盖。

实际执行入口建议为内部 CLI 子命令 `wiscode bmad init`，桌面和独立 CLI 共用。桌面将打包的 CLI 绝对路径通过环境传给 sidecar；独立 CLI 使用自己的可执行文件路径。V1/V2 的斜杠命令都调用该入口。这样模型和提示词变化不会改变文件写入规则。实施时必须验证 Windows 与 macOS 的 shell 工具能调用此绝对路径；若权限系统另有执行确认，需作为体验限制如实报告。

不选全局预装技能：会让所有项目看到 BMAD，且无法为项目固定版本。不选直接把发行资源接入技能发现：项目无法自包含，WisCode 升级会无声改变技能内容。不选只放 Markdown 命令去跑 `npx`：违反免安装和固定版本要求，且难以保护用户文件。

## 资源与分发

仓库保存 `third_party/bmad/skills/`、上游 `LICENSE`、来源 URL、固定 commit、BMAD 版本、文件摘要，以及任何 WisCode 适配补丁的清单。更新工具从干净的指定提交机械复制，再单独应用和验证补丁，不带入 `.git`、缓存或本地文件；上游升级是显式代码评审，不在应用启动时抓取 `main`。

发行物同时附带目标平台的 uv 二进制及许可证。uv 0.6.13 的 8 个平台归档预置于 `third_party/uv/v0.6.13/`，覆盖 macOS x64/arm64、Windows x64/arm64、Linux glibc/musl x64/arm64。按离线构建要求，这些约 124 MB 的归档必须入库，接受仓库体积增长；不得改为构建时下载。构建前逐个核对固定 SHA-256，缺包或校验失败即中止，不联网下载或回退到系统 uv。独立 CLI 的 Linux 目标也使用同一份本地资源。`packages/desktop/resources/` 中的 uv/BMAD 副本只是构建输出，不入库。构建检查要解包最终安装产物，而不只检查构建输入目录。

资源定位依次使用桌面传入的显式路径、独立 CLI 可执行文件旁的约定目录；只有开发态允许使用仓库内路径。生产态找不到资源应报“发行包缺失或损坏”，绝不临时联网安装 BMAD。桌面进程把内嵌 uv 所在目录加到 sidecar PATH 前端，CLI 也做同样处理；后续 agent 执行 BMAD 脚本时应找到同一版本 uv。用户级 BMAD 来源缓存中的模块记录在 staging 阶段改为指向稳定的 `file:<cache>/current/skills`；状态预检不应访问 GitHub，项目副本也引用这一稳定目录。

**边界：离线构建不等于离线初始化。** 内嵌 uv 不等于内嵌 Python。首次 `uv run` 在本机没有合格解释器时仍可能下载 CPython；部分 BMAD 脚本的第三方依赖也可能触网。本轮承诺 uv 资源免联网构建和用户免手动安装，不承诺 BMAD 首次初始化离线。下载失败要保留 uv 的具体错误，不偷偷改用系统 Python 或跳过 setup。若要完全离线初始化，需另行设计内嵌解释器和依赖缓存，并评估安装包体积。

## 项目布局与文件所有权

项目技能落点明确选用 `<project>/.agents/skills/<id>/`，与官方 skills CLI 的 OpenCode 项目级落点一致，减少混用时的同名重复。默认模块为 Core Tools + Method：从 `bmod.toml` 解析其技能列表，安装相应技能及 `bmad`、模块记录到该目录。交互模式可以附加 Toolsmith。上游 setup 在 `<project>/_bmad/` 生成运行时，默认输出目录沿用 BMAD 模板的 `_bmad-output/`。平台路径固定，不向用户提问。V2 的 `.agents/skills` 发现及同名技能优先级是本方案的实现项和验收项。

在 `<project>/.wiscode/` 下保存 WisCode 管理清单，记录来源 commit、模块集合、每个已安装文件的相对路径与摘要；清单不改变技能的 `.agents/skills` 落点。旧项目的 `.opencode/bmad-managed.json` 仍可读取；重跑初始化并验证所有权后迁移到 `.wiscode`，两份清单同时存在则报冲突。路径必须限制在项目技能目录内；拒绝来源路径穿越和目标路径中的符号链接。第一次安装遇到同名用户技能或其他安装器产物时停止，不接管。重跑时只覆盖“当前内容仍与上次记录摘要一致”的文件；用户改动保留并列为冲突。新快照不再包含的文件默认保留；删除必须明确确认，且仅能删清单证明为 WisCode 管理、内容未被用户更改的文件。管理清单采用原子写入，不能在部分失败时声称成功。

`_bmad/` 始终交由上游 setup 管理，WisCode 不自行重建或覆盖定制。执行前检查 `--status` 中的退休、重命名和迁移信息。快速模式遇到此类操作返回“需确认”，交互模式逐项说明后再征得同意。已有 `_bmad/config.toml` 的值保持不变；快速模式只为新增配置问题填上游提供的默认值。若新问题没有默认值，快速模式停止。

## 命令与初始化协议

初始化器返回稳定的 JSON 结果，至少区分 `ready`、`questions`、`needs-confirmation`、`conflict` 和 `error`；包含项目目录、来源 commit、变更数量、未解决问题、上游 setup 结果摘要及下一步。`questions` 和 `needs-confirmation` 是正常的待续阶段，退出码为零；不可继续的 `conflict`、`error` 返回非零。交互模式第一次调用只返回问题，**不写入真实项目**。

快速模式按以下顺序运行：

1. 规范化项目目录，验证可写性、BMAD/uv 资源、目标目录和现有管理清单。预检失败时不修改项目。
2. 从内置模块记录计算技能集合，以 vendored `bmad` 运行上游只读 `--status` 和 `--list-config-questions`。`setup.py` 总会把 `skill_root.parent` 加入发现根，因此此时可能看见完整 vendor 集合（包括未选的 Toolsmith）；预检结果必须按目标模块过滤。如需要迁移、删除、覆盖或出现无默认值问题，则返回对应状态。
3. 只同步允许管理的技能文件。将默认答案写入临时 TOML，调用 `uv run --no-cache <project>/.agents/skills/bmad/scripts/setup.py --project-root <project> --skill <project>/.agents/skills/bmad --root <project>/.agents/skills`，有问题时加 `--module-answers`。正式执行必须用项目副本，使发现根与脚本来源都属于该项目。通过进程参数数组传路径，不拼接 shell 命令；JSON 从 stdout 解析，错误信息单独从 stderr 捕获。
4. 检查退出码、解析上游 JSON、校验关键产物，删除临时答案文件并更新管理清单。setup 失败时报告已完成的阶段和可重试方式，不把部分安装标为 `ready`。

交互模式是两阶段协议：第一次返回输出目录、模块范围等产品选项和 BMAD 的待答 `config_questions`；斜杠命令逐项询问用户。第二次带结构化答案与具体确认标识，重新预检以防项目状态在两次调用之间变化，然后执行同一初始化器。上游问题的答案必须与待答集合精确匹配，按 `--module-answers` 的 TOML 格式传给 `setup.py`。已有输出目录配置不能被新答案静默覆盖；要修改旧值时应展示当前值及目标配置文件。

已核实：首次安装可以通过内置 `--skill <vendor>/bmad` 执行只读预检，无需先写真实项目；其附带发现完整 vendor 根目录的行为需在测试里覆盖。对于“预检看到全部模块而正式安装只选部分模块”的差异，必须按目标模块过滤或使用临时过滤副本验证。

## 更新通道与技能发现

BMAD 升级随 WisCode 发版：选定新的 BMAD `main` HEAD 并记录 SHA，运行上游 validator 与 setup 测试，重新生成 vendor 快照，人工审查清单、配置、退休/重命名和脚本差异，运行 WisCode 的首次安装与旧项目升级集成测试，再检查各平台安装包。门禁通过后仍需人工决定是否纳入本次发版；测试不能保证捕获所有上游行为变更。项目更新由用户重跑 `/bmad-init`，不在打开项目时自动写入项目。正式 tag 出现后是否改跟 tag 是另一项稳定性决策，不作为自动切换规则。

项目副本的模块 `update_source` 改为 `file:`，指向 WisCode 管理的稳定用户级“当前内置 BMAD 来源”目录，而不是可能随应用升级或移动而失效的 app bundle 绝对路径。桌面启动及独立 CLI 首次调用 BMAD 命令时，从已校验的发行资源原子刷新该目录；不从网络更新。`setup.py` 会读取其中的 `<module>/bmod.toml` 对比版本。同一 BMAD 版本号可能对应不同快照，因此 WisCode 还须比较来源 commit 和摘要，不能只相信上游的 `current` 状态。多版本 WisCode 并存或旧版本尝试降级时，应拒绝静默降级。

**已发现的上游限制：** 当前 `setup.py` 的 `next_step()` 只要看到 `update_available`，就返回 `npx skills update`，即使该模块的 `update_source` 为 `file:`。所以 `file:` 解决了本地版本比较，**没有**解决用户可见的更新指引。实施时必须让 `bmad status` 指向重跑 `/bmad-init`：推荐维护一份最小的上游脚本补丁，为本地来源生成正确的 `next`，并用旧版项目/新版来源的真实状态测试保护它；每次刷新 `main` 时重新应用、审查此补丁，条件允许时向 BMAD 上游提交修复。仅在 WisCode 自己的页面改写状态文案不够，因为用户仍可直接运行 BMAD 的 status 流程。

复制技能后，需要显式刷新 V1/V2 的技能发现缓存；应为缓存失效增加可测试的路径。若当前架构无法可靠刷新，首版必须明确提示新开会话，不能宣称即刻可用。同名用户技能的优先级也必须测试，不能因刷新而悄悄被覆盖。

## 安全和失败处理

- BMAD 或 uv 缺失、校验失败、平台架构错误：立即停止，不使用系统备份版本或在线安装。
- Python/依赖下载失败：保留可重试状态和 uv stderr，不伪造 `_bmad/`。
- 原有技能、损坏的管理清单、用户改动或符号链接：拒绝覆盖，并报告具体路径；不使用 `bmad*` 通配符删除。
- 退休技能、迁移或定制文件重命名：逐项确认；快速模式不删除。
- 中断、重复运行、并发运行：安全写入与临时文件清理；同项目并发初始化互斥或显式拒绝。
- 路径含空格、中文以及 Windows 反斜杠：进程参数和 TOML 值正确转义，加入跨平台测试。
- 保留上游许可证与技能正文；安装副本中的模块记录修改更新来源，必要的 `setup.py` 适配以独立最小补丁维护，不 fork 大量 BMAD 提示词。

## 验收计划

自动测试覆盖首次快速安装、交互两阶段、默认答案与无默认值、旧配置保留、同名用户技能、用户编辑、重复运行、更新与降级、路径编码、资源缺失、uv 失败、迁移确认、并发、符号链接和失败重试。额外覆盖 vendored 与项目副本作为 `--skill` 时的发现范围差异、V1/V2 的 `.agents/skills` 发现，以及混用官方 skills CLI 后的重复技能处理。必须用真实 vendored `setup.py` 在临时项目跑端到端，不仅模拟其 JSON。

执行上游清单校验与 setup 测试；在相关 package 目录运行 `bun typecheck` 和聚焦测试；检查 macOS/Windows 构建产物中的 BMAD、uv、许可证与执行权限。桌面和独立 CLI 均验证 `/bmad-init`、`--interactive`、技能发现和后续 `uv run`。Windows 需要实机验证，不能以 macOS 交叉构建代替。实施后先交付人工验证，不自行提交。

## 评审待确认

1. 内嵌 uv 是否只要求免手动安装，允许首次运行下载 Python/依赖？本文按允许下载设计。
2. 若技能缓存不能可靠地即时刷新，首版是否接受“初始化后新开会话才可使用”？本文优先实现刷新，但不预先承诺即时可见。
3. 默认模块是否确认为 Core Tools + Method，Toolsmith 仅在交互模式可选？本文按此设计。
