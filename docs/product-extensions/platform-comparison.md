# Paseo 字节版：平台对比与选型

**你不一定需要换掉现在的 AI 工具。Paseo 字节版更适合把几种工具、几台机器和几类工作接在一起。**

配合[功能介绍与上手指南](./byte-edition.md)阅读：介绍页回答“有哪些功能、怎么开始”，本页回答“和其他平台有什么重合、为什么还值得用、什么情况下不必换”。

## 对比口径

核对日期：**2026-10-13**。产品变化很快，以下比较是资料与代码核对，不是六个平台的完整实测，也不是模型效果、性能或价格排名。

| 对象         | 本次范围与依据                                                                                                   |
| ------------ | ---------------------------------------------------------------------------------------------------------------- |
| Paseo 字节版 | 本仓库 `feature_paseo` 分支，已提交功能基线 `a72be7f56`；不把正在开发的未完成能力算作可用功能                    |
| 官方 Paseo   | 核对当日的官方功能、Provider、调度和扩展文档 [P1]、[P2]                                                          |
| Botmux       | 本地源码提交 `010b99b8` 的 README、Oncall 和 Workflow 文档；版本描述不一致时，以该提交的 README 为准 [B1]、[B2]  |
| TRAE         | 官方桌面 / IDE / Web / 移动端介绍，以及本机 TRAE CLI `0.210.1-alpha.2` 的帮助命令；不同客户端能力不混为一谈 [T1] |
| AIME         | Aime 个人助理、自定义助理、项目空间及 Aime App 的内部产品指南；需要有权访问相应文档 [A1]、[A2]、[A3]、[A4]       |
| Codex        | 官方 App / CLI、插件和定时任务文档；部分旧 Codex 文档地址已重定向到 ChatGPT 学习站 [C1]、[C2]、[C3]              |

读表时注意：

- **多模型不等于多 Provider。** 一个工具能选多个模型，不等于它直接管理 Claude Code、Codex、TRAE CLI 等不同执行程序。
- **有扩展接口不等于已经配好业务流程。** Skill、MCP、插件都能补能力，要比较的是你还需要连接哪些步骤。
- **没核实不等于不支持。** “未核验”表示本次资料不足；不会据此把某项能力判为字节版独有。
- **可配置不等于开箱免授权。** 业务工具、模型和飞书权限都需要实际配置；自托管也不等于内容永不发送到模型服务。

## 一、同维度看已有能力

### 入口、运行环境与代码工作

| 维度             | Paseo 字节版                             | 官方 Paseo                           | Botmux                                | TRAE                                               | AIME                                         | Codex                                      |
| ---------------- | ---------------------------------------- | ------------------------------------ | ------------------------------------- | -------------------------------------------------- | -------------------------------------------- | ------------------------------------------ |
| 主要操作入口     | 桌面工作区、Web、手机、CLI、飞书         | 桌面工作区、Web、手机、CLI           | 飞书、流式卡片、Web 终端、Dashboard   | Agent / IDE 窗口、Web、移动端、CLI                 | Web、桌面、飞书、App                         | App、CLI、IDE、Web / 移动相关入口          |
| 多种 AI 执行工具 | 多 Provider，含 Aiden 适配               | 多 Provider 与 ACP，已含 TRAE CLI    | 多 CLI 桥接                           | 以 TRAE Agent / CLI 为核心，支持多模型与自定义模型 | 平台模型、工具与 Agent，已提供 TRAE CLI 协同 | 以 Codex 执行为核心，可配置模型并连接工具  |
| 本地与远程工作   | 自管主机与 daemon；工作区、插件均选主机  | 自托管 daemon、远程连接与多端操作    | daemon 部署、跨 daemon 管控、终端接入 | 本地 / 云端、Remote SSH / WSL；CLI 有远程命令      | 云端托管与指定本地目录协同                   | 本地执行、云端任务；本地定时任务需主机在线 |
| 并行与协作       | 多会话、worktree、助手团队和编排         | 多 Agent、worktree、跨 Provider 编排 | 多 Bot、多话题、角色派工              | 多 Agent 任务、自定义 Agent                        | 并行任务、个人 / 团队助理、共享会话          | 子 Agent、并行云端任务、独立 worktree      |
| 代码检查与验证   | 终端、Diff / PR、多仓库分组、桌面浏览器  | 终端、Diff / PR、桌面浏览器          | CLI 原生能力、可交互终端、运行日志    | 编辑器、补全、调试、Git、Review、预览              | 本地代码与 CR、浏览器、内部研发工具          | 代码执行与 Review、Diff、浏览器和工具      |
| 运行管理         | 历史、队列排序、摘要、归档、插件执行记录 | 会话、工作区、后台服务与调度管理     | 卡片控制、tmux 常驻、接管 / 恢复会话  | 任务、会话与变更管理                               | 独立任务、定时任务和助理管理                 | 会话恢复、继续引导、任务及定时记录         |

这里没有“只有字节版能远程”“只有字节版能并行”的结论。字节版更具体的价值是：**开发、知识、飞书和插件采用相同的 Project 与主机选择方式，减少分别配置和查找的工作。**

### 知识、自动化与业务接入

| 维度           | Paseo 字节版                                              | 官方 Paseo                                           | Botmux                                                       | TRAE                                                 | AIME                                             | Codex                                                            |
| -------------- | --------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------ | ---------------------------------------------------- | ------------------------------------------------ | ---------------------------------------------------------------- |
| 项目资料组织   | 多目录、Git 分支、分层知识、飞书文档与群上下文            | Project / Workspace、工具配置与 Skills               | 工作目录、仓库绑定、CLI 上下文                               | 文件、代码库、文档集、网页上下文                     | 空间关联代码、TCE、Meego、测试与文档库           | 项目、文件上下文、插件与 Skills                                  |
| 长期经验复用   | 全局 / Project / 助手记忆，可管理、整理、按范围跨主机同步 | 可复用 Provider 原生记忆与配置；同等管理界面未核验   | 复用 CLI 原生记忆，并有 Skill Registry                       | 上下文与自定义 Agent；同等分层同步未核验             | 历史、偏好与长期记忆，助理和群聊可配置共享范围   | 持久上下文、Skills；官方相关助理文档也有记忆，不能笼统称“无记忆” |
| 工具与技能扩展 | Skills、MCP、插件和项目绑定配置                           | Skills、MCP、应用插件                                | CLI 能力、Skill Registry 和 Bot 策略                         | 自定义 Agent、MCP、编辑器扩展；CLI 有插件            | Skills、MCP、空间共享和 Aime App                 | Skills、MCP、插件                                                |
| 定时与多步工作 | 计划、会话跟进、图编辑 Workflow、脚本 / AI / 分支 / 循环  | 调度、心跳、编排工具和插件                           | 定时任务、多 Bot、v3 工作流与保存复用                        | Agent 多步执行、CLI 脚本化；同类可视化流程编辑未核验 | 并行任务、定时、空间模板与流程联动               | 定时任务、Skills、`codex exec` 与脚本 / CI                       |
| 飞书协作       | 多机器人、话题、替身、提醒、通讯录与授权处理              | 通用扩展基础；本分支这组专用界面未在所查官方文档确认 | 核心能力：卡片、话题、终端、Oncall、多 Bot                   | 本机 CLI 已有渠道命令；不把它写成“无法接消息渠道”    | 个人 / 自定义 Bot、群聊、共享任务、日历及文档等  | 可通过插件和工具接外部系统；同类飞书专用界面未核验               |
| 应用与服务扩展 | Project 插件页面、声明式网页、Workflow 异步 HTTP 接口     | 应用插件、CLI、TypeScript SDK、MCP、Hub              | Dashboard、CLI 和工作流                                      | IDE 扩展、Agent 工具、ACP 等 CLI 接口                | Aime App 小程序生态、自定义画布与工作台          | 插件、应用工具、CLI 自动化及 SDK                                 |
| 字节业务流程   | 随分支提供研发、对账开发、Bamboo / Argos 排查插件         | 可自行扩展；未确认预置相同插件                       | 已有 Oncall / Argos 场景，不等于已核实相同日报入表及审核流程 | 可用模型、工具和技能实现业务操作                     | 已有 Meego、Codebase、Argos、Bits 等广泛内场能力 | 可通过工具和技能接入内部业务                                     |
| 运维责任       | 自己维护服务端、工具、权限、升级                          | 自托管为主，可选官方服务                             | 自己维护 daemon、CLI、机器人和终端环境                       | 平台服务与本地客户端结合                             | 托管云端助理；本地操作仍依赖本地环境             | 平台服务与本地执行结合                                           |

“业务插件”这一行比较的是**是否有本仓库这套可配置、可回看、可调试的实现**，不是其他平台能否分析报警。调用一次 Argos 工具、定时执行一个 Skill、持续处理群报警，是不同的使用方式。

## 二、逐一对齐：增量在哪里

### 相比官方 Paseo：补上字节业务这一层

官方 Paseo 已提供很完整的通用开发底座：多 Provider、多端、worktree、文件编辑、终端、Diff / PR、浏览器、调度、插件和编排。官方 Provider 目录中也已经列出 TRAE CLI。[P1]、[P2]

字节版增加的重点是：

- **项目资源管理：** 多项目目录、Git 来源与分支、分层知识、飞书文档缓存和群上下文，配合全局 / Project / 助手记忆。
- **流程与角色：** 助手团队、图形化 Workflow、节点输入输出与日志，以及 Workflow HTTP 服务和声明式应用。
- **业务入口：** 飞书渠道、替身、提醒、通讯录；字节研发与对账开发；Bamboo / Argos 报警处理和任务记录。

**适合你：** 喜欢 Paseo 的工作方式，又不想从通用插件接口开始搭建上述业务流程。

**取舍：** 字节版需要持续跟进上游适配，不能保证官方刚发布的所有能力都已经合入本分支。通用开发需求为主时，直接用官方版也是合理选择。

### 相比 Botmux：从飞书终端扩展到项目工作台

Botmux 的长处是直接桥接 CLI，保留终端交互，并通过飞书卡片、Web 终端和 tmux 接管会话。它已有多 Bot 协作、Oncall、定时、v3 工作流和 Dashboard，不能描述成“只转发消息”。[B1]、[B2]

字节版更适合把操作重心放到 Project：一边查代码和 Diff，一边管理知识、助手、记忆、Workflow 以及业务插件项目。报警排查有独立配置和执行记录，不需要所有管理动作都从话题或终端命令发起。

**适合你：** 同时需要飞书协作、桌面开发、多个开发机和业务插件管理。

**取舍：** 如果最重要的是原汁原味操作 CLI、从飞书接管已有 tmux 会话，Botmux 路径更直接。其 tmux 模式还提供 daemon 重启时 CLI 继续运行的能力；不要据此推断 Paseo 重启也有同样保证。

### 相比 TRAE：保留编码能力，把执行工具组合起来

TRAE 已具备 IDE 和 Agent 工作区、多端、本地 / 云端、远程开发、多模型、MCP、自定义 Agent、代码补全、调试和 Review。它并不是只能在一台电脑上写代码的编辑器。[T1]

本机 TRAE CLI 帮助也能看到 `review`、`mcp`、`plugin`、`channel`、`acp`、`dashboard`、`queue`、`remote-control` 等命令；其中部分远程服务命令标为实验性。命令存在不代表每个客户端或安装版本都已完整开放。

字节版的增量是把 **TRAE CLI 作为一个 Provider**，与 Aiden、Claude Code、Codex 等一起参与 Project、助手团队和业务 Workflow。选择多套执行工具，不必把每项工作都迁到 TRAE 的同一种运行方式。

**适合你：** 编码时继续用 TRAE CLI，同时让其他工具参与审核、排查或批处理，并统一接入飞书业务。

**取舍：** Paseo 不复制 TRAE 的 CUE 补全、完整 IDE 调试器或所有原生扩展。重度编辑与调试仍可以留在 TRAE IDE。

### 相比 AIME：更偏向自己掌握执行环境与具体流程

AIME 已有云端常驻助理、桌面本地文件与浏览器操作、飞书、多任务并行、长期记忆、Skills / MCP、团队空间与 Aime App。指南还列出了 Meego、Codebase、Argos、Bits、数据分析等能力，以及与 TRAE CLI 的协同。[A1]、[A2]、[A3]、[A4]

因此，字节版的优势不是“AIME 没有项目、记忆、飞书或插件”，而是：

- **执行环境由你管理。** 可以在自己已有的 Mac / Linux 主机上使用已经配置好的 CLI 和业务工具，并明确指定插件项目的执行主机。
- **流程可以落到脚本和节点。** Bash / Python 负责固定操作，AI 负责判断，条件与重试由配置决定，输入输出和产物可以逐步检查。
- **专门业务已有实现。** 对账开发、报警入表去重、队列、独立审核、报告归档和人工重试有本仓库中的页面与代码，便于针对自己的 SOP 调整。

**适合你：** 需要贴近现有开发机、自定义工具链，并愿意自己维护服务与业务流程。

**取舍：** AIME 的托管运行、内场工具覆盖和团队资源治理能减少环境维护工作；Paseo 字节版不替代这些平台服务。AIME 也能通过 Skill / App 构建类似业务流程，只是实现方式和维护责任不同。

### 相比 Codex：让 Codex 加入更大的工作流程

Codex 官方 CLI 已能检查、修改和运行本地代码，进行 Review、子 Agent 分工、Skills / MCP / 插件调用及云端任务。App 相关文档还覆盖浏览器、跨端、长期任务和自动化，不能把它写成“只能聊天、不能自动执行”。[C1]、[C2]、[C3]

Paseo 字节版可以保留 Codex 作为 Provider，再把它与其他执行工具、Project 知识、助手团队和飞书业务衔接。比如同一套报警流程选择 Codex 排查，另一项目选择 TRAE CLI，而记录管理和配置入口保持一致。

**适合你：** 想继续用 Codex，又需要多 Provider、字节业务插件以及自管主机上的统一工作台。

**取舍：** Provider 适配层不等于完整嵌入 Codex App。官方 App 的新功能、插件界面、账户策略和工具不一定能通过 Paseo 原样使用。

## 三、怎样判断字节版是否值得接入

先选一个真实工作流程，看能减少多少重复连接和配置，而不是比较谁的功能名更多。

| 你的工作                           | 可以先验证什么                                                           | 字节版的价值所在                         |
| ---------------------------------- | ------------------------------------------------------------------------ | ---------------------------------------- |
| 每次跨仓开发都要重新贴文档、选工具 | 建一个多目录 Project，配置知识和助手，完成一个小改动并检查各仓库 Diff    | 把上下文、角色和审查入口围绕项目组织     |
| 每条报警都要手动登记，再贴给 AI    | 用一个测试群和一条已知报警，检查扫描、入表去重、队列、审核及报告记录     | 已有持续处理的连接步骤，而不只是单次问答 |
| 团队同事反复问相似问题             | 用一个测试替身，限定名单和问题范围，验证合并等待、回复与手动纠正         | 能限制回答范围，也能查失败原因和补发     |
| 已有能跑的脚本，但人工一直盯流程   | 把固定步骤与 Agent 节点接成 Workflow，检查输入输出，再按需提供 HTTP 入口 | 复用现有脚本，把自动化做成能检查的流程   |
| 单一工具已经满足你的任务           | 先不迁移，保留当前工具，只把真正需要多工具或业务衔接的部分接进来         | 不为统一界面而重做所有工作               |

字节版不保证模型更聪明、所有任务成功或费用更低。**它要减少的是连接工具、准备背景、推进固定步骤和寻找结果的时间。**是否真的省事，应以你的代码、权限和业务数据跑一遍为准。

## 四、依据与维护说明

### Paseo 字节版

主要功能对应的本地依据：

- [功能清单与接线规范](../extension-development-standard.md)：Project、飞书、替身、Provider、桌面体验和插件能力。
- [功能审计清单](../pre-rebase-feature-inventory.md)：助手团队、知识、队列、会话及各主要入口。
- [Workflow](../workflows.md)、[Memory](../memory.md)：流程节点、运行观测、记忆策略与跨主机同步。
- [插件说明](./plugins.md)：研发、对账开发、HTTP 服务、网页应用和插件生命周期。
- [Bamboo 对齐规范](./bamboo-troubleshooting-alignment.md)、[Argos 对齐规范](./argos-troubleshooting-alignment.md)：入表、队列、审核、报告与受控重试。
- [浏览器工具](../../public-docs/browser.md)、[Go SDK](../../packages/client-go/README.md)：能力与运行前提。

### 其他平台

- **P1：** [官方 Paseo 定位与功能](https://paseo.sh/docs/why.md)、[官方文档索引](https://paseo.sh/llms.txt)。
- **P2：** [官方 Paseo Provider 目录](https://paseo.sh/docs/supported-providers.md)，包含 TRAE CLI 条目。
- **B1：** [Botmux README，提交 010b99b8](https://github.com/deepcoldy/botmux/blob/010b99b8/README.md)。该版本 README 说明 v3 工作流与保存复用，并注明旧运行时已下线；不照搬其他页面的旧版状态。
- **B2：** [同提交的 Botmux Oncall 文档](https://github.com/deepcoldy/botmux/blob/010b99b8/docs-site/docs/zh/oncall.md)，说明目录绑定、权限分层与报警场景。
- **T1：** [TRAE 官方产品介绍](https://docs.trae.ai/ide/what-is-trae)。本次读取页面的正文更新时间为 2026-10-12；CLI 补充依据为本机 `traecli --version` 与 `traecli --help`，没有把命令帮助当成完整功能实测。
- **A1：** [Aime 个人助理使用说明](https://bytedance.larkoffice.com/wiki/NV9EwaPMPiNlJhkPC2CcCIoXn3g)。
- **A2：** [Aime 自定义助理使用指南](https://bytedance.larkoffice.com/wiki/YlFZwLM1cifOntkX5zUcnnW5n7g)。
- **A3：** [Aime 空间配置指南](https://bytedance.larkoffice.com/wiki/R8YIw8XXLixg3okhYfpcSv4Zn3g)。
- **A4：** [Aime App 产品说明](https://bytedance.larkoffice.com/docx/LlnIdaoDuoDykfxbxD1cCVMmnve)。
- **C1：** [Codex 官方 CLI 文档](https://learn.chatgpt.com/docs/codex/cli)。
- **C2：** [官方 App 功能文档](https://developers.openai.com/codex/app/features)，原地址会跟随官方文档迁移。
- **C3：** [官方定时任务文档](https://learn.chatgpt.com/docs/automations.md?surface=app)，包含项目、worktree、Skills 和运行前提。

AIME 引用是有访问权限要求的内部文档，只在这里概括与选型相关的能力，不复制指南全文。平台的地区、账户、版本和灰度状态可能不同；升级或更新本页时应重新核对，不把旧限制写成永久限制。

[P1]: https://paseo.sh/docs/why.md
[P2]: https://paseo.sh/docs/supported-providers.md
[B1]: https://github.com/deepcoldy/botmux/blob/010b99b8/README.md
[B2]: https://github.com/deepcoldy/botmux/blob/010b99b8/docs-site/docs/zh/oncall.md
[T1]: https://docs.trae.ai/ide/what-is-trae
[A1]: https://bytedance.larkoffice.com/wiki/NV9EwaPMPiNlJhkPC2CcCIoXn3g
[A2]: https://bytedance.larkoffice.com/wiki/YlFZwLM1cifOntkX5zUcnnW5n7g
[A3]: https://bytedance.larkoffice.com/wiki/R8YIw8XXLixg3okhYfpcSv4Zn3g
[A4]: https://bytedance.larkoffice.com/docx/LlnIdaoDuoDykfxbxD1cCVMmnve
[C1]: https://learn.chatgpt.com/docs/codex/cli
[C2]: https://developers.openai.com/codex/app/features
[C3]: https://learn.chatgpt.com/docs/automations.md?surface=app
