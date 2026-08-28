# `feature_paseo` rebase 前功能清单与恢复审计

## 审计基线

- rebase 前最终提交：`10a1de15b4f59c08a23787c3a65d62d86ac3d5a8`
- rebase 完成提交：`171b34c8d21394357cb0a0659bedea44fe75d0a5`
- 两个提交的 Git tree 均为：`7aeb483b7040c8041f89a1b4c4b1e111e1698821`
- 结论：rebase 完成时没有发生代码树级丢失；后续仍需防止入口、注册、能力声明和共享页面接线回归。

状态说明：

- **保留**：当前实现与 rebase 前能力一致，入口和后端接线仍存在。
- **适配**：能力保留，但已适配 master 的新架构或交互。
- **本轮恢复**：审计发现当前分支相对 rebase 前出现真实缺失，并已补回。

## 功能清单

| 功能                   | 用户入口与行为                                                                           | 关键实现与接线                                                                           | 当前状态                           |
| ---------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- | ---------------------------------- |
| 助手管理               | 主机设置中创建、编辑、删除和选择助手                                                     | `packages/app/src/screens/settings/assistants`、`host-resource-pages.tsx`、assistant RPC | 保留                               |
| MCP 管理               | 主机设置中管理和测试 MCP 服务                                                            | `packages/app/src/screens/settings/mcp`、MCP protocol/session                            | 保留                               |
| Skill 管理             | 主机设置中管理 Skill、选择 Agent Skill                                                   | `packages/app/src/screens/settings/skills`、`agent-skills`、skill RPC                    | 保留                               |
| Team 与 Provider 目录  | 管理团队、Provider、模型和默认 Agent 配置                                                | `settings/teams`、providers、agent profile                                               | 保留                               |
| 飞书渠道               | 配置机器人、授权用户、配对和消息渠道                                                     | `settings/channels`、`protocol/channel/lark`、server channel session                     | 保留                               |
| 飞书通讯录映射         | 用邮箱、群名称解析 Open ID 和 Chat ID                                                    | `lark-directory-fields.tsx`、directory RPC                                               | 保留                               |
| 飞书定时提醒           | 创建、启停、删除提醒，回复后停止                                                         | `lark-reminder-section.tsx`、reminder RPC/service                                        | 保留                               |
| 上下文话题会话         | 将飞书话题和 Agent 会话关联                                                              | Lark channel service、topic conversation storage                                         | 保留                               |
| 连接管理               | 查看连接状态、历史连接、删除和自动清理                                                   | `HostConnectionsPage`、client access/relay history RPC                                   | 适配                               |
| 设备配对               | 展示配对二维码、链接和历史设备                                                           | `PairDeviceSection`、pairing protocol                                                    | 适配：由独立页面改为设置页直接渲染 |
| Relay 配置             | 配置公网 Relay、配对地址和本地 Relay                                                     | `host-page.tsx`、`host-local-relay-section.tsx`、daemon config                           | 适配                               |
| 主机外观               | 修改主机名称、颜色和徽标展示                                                             | `host-appearance-section.tsx`、host runtime persistence                                  | **本轮恢复：重新接回主机概览页**   |
| 客户端身份             | 设置客户端名称并展示稳定客户端 ID                                                        | `settings-screen.tsx`、client identity helpers                                           | 保留                               |
| 守护进程稳定性         | supervisor/worker 心跳、退出和重启不丢活跃任务                                           | `supervisor.ts`、`daemon-worker.ts`、host runtime                                        | 适配                               |
| Go SDK                 | Go 客户端、Agent 管理、消息、审批和订阅                                                  | `packages/client-go`                                                                     | 保留                               |
| Workflow 发现与入口    | 侧边栏进入 Workflow 页面，Agent/CLI 可发现流程                                           | `/workflows`、`left-sidebar.tsx`、Paseo skill、CLI                                       | 保留                               |
| Workflow v1 协议       | `data`、`workflow.var`、`loop.var`、`node.var`、`origin_input`、`base_resp`、`artifacts` | `packages/protocol/src/workflow`、server workflow runtime                                | 保留                               |
| Bash/Python 节点协议   | stdin 输入、stdout/stderr 日志、fd 3 结构化输出，退出码和重试语义                        | workflow runtime、node executors                                                         | 保留                               |
| 声明式 Python 节点     | 支持 cwd、env、module/function 和内联代码                                                | workflow schema/runtime/editor                                                           | 保留                               |
| Agent 节点             | 普通/自定义输出、生命周期复用、后续提示词、归档策略                                      | workflow agent executor/editor                                                           | 保留                               |
| For 节点               | 数组、数字、true 循环；串行/并行；并发度和 loop.var                                      | workflow runtime/editor                                                                  | 保留                               |
| Retry/Until            | 最大次数、条件结束和 attempt 上下文                                                      | workflow runtime/schema/editor                                                           | 保留                               |
| Switch 与映射          | 表达式分支、input.data 映射和 schema 检查                                                | workflow runtime/editor                                                                  | 保留                               |
| Workflow 图编辑        | 自动布局、缩放、拖拽节点和连线、节点完整编辑                                             | `components/workflows`、graph layout/model                                               | 保留                               |
| Workflow 运行观测      | 节点输入输出、日志、耗时、运行结果和取消                                                 | workflow run service/editor                                                              | 保留                               |
| Workflow plan/dry-run  | 校验、计划和副作用预览                                                                   | workflow service/CLI/editor                                                              | 保留                               |
| 批量归档               | 侧边栏批量选择并归档 Workspace                                                           | sidebar workspace actions                                                                | 保留                               |
| 消息时间               | Agent 最终回答展示发送时间                                                               | agent stream timeline/footer                                                             | 保留                               |
| 中文输入与大文本编辑   | IME 不被刷新打断；Tab 缩进；完成后提交草稿                                               | workflow expanded editor、composer drafts                                                | 保留                               |
| 全局记忆               | 全局用户记忆、策略、总览/明细和管理                                                      | memory server、host memory settings                                                      | 保留                               |
| Project 记忆           | Project 粒度记忆、总览/明细、编辑和删除                                                  | project memory card、memory management routes                                            | 保留                               |
| 助手记忆               | 使用助手时沉淀并按需加载助手记忆                                                         | assistant memory scope/server context                                                    | 保留                               |
| 记忆整理               | 每日合并重复、删除低价值的 24 小时前记忆                                                 | memory organizer/service                                                                 | 保留                               |
| 记忆同步               | 选择全局、Project 或助手范围进行单向/双向同步                                            | memory sync UI/RPC                                                                       | 保留                               |
| 分层记忆加载           | 系统提示仅提供总览路径，Agent 按需读取明细                                               | memory prompt/context builder                                                            | 保留                               |
| Project 创建           | 支持单目录、多目录和无初始目录 Project                                                   | add-project flow、project RPC                                                            | 保留                               |
| Project 层级           | 创建子 Project，继承父 Project 知识并树形展示                                            | `project-hierarchy.ts`、sidebar projection、parent link                                  | 适配                               |
| Project 配置           | 路径、项目目录、变量、索引、脚本和元数据                                                 | `project-settings-screen.tsx`、project config RPC                                        | 保留                               |
| Project 存储           | 管理数据位于 `~/.paseo/projects/<projectId>`                                             | server project storage paths                                                             | 保留                               |
| Project/Workspace 删除 | 清理托管临时数据，不删除外部代码目录                                                     | project/workspace remove RPC 与确认界面                                                  | 保留                               |
| Project 通用知识       | 本地目录、本地文档、云文档，按需加载                                                     | project knowledge editor/context                                                         | 保留                               |
| Project 规范知识       | 100% 注入并要求 Agent 遵守                                                               | project knowledge schema/context                                                         | 保留                               |
| Project 专有知识       | 100% 注入、由 Agent 按需采纳                                                             | project knowledge schema/context                                                         | 保留                               |
| 全局知识               | 主机级通用知识和规范知识                                                                 | `host-knowledge-section.tsx`、global knowledge storage                                   | 保留                               |
| 云文档缓存             | 本地缓存、过期检查、失效重下、手动刷新和授权请求                                         | cloud-cache server/app controls                                                          | 保留                               |
| Project 飞书群上下文   | 绑定机器人和群，拉取群消息作为上下文                                                     | Project Lark editor/service/context                                                      | 保留                               |
| 多仓库 Agent           | Project 下多个可写代码目录均可被 Agent 使用                                              | project directories/context                                                              | 保留                               |
| Project 关联插件       | Project 设置展示关联插件项目并可跳转                                                     | `ProjectLinkedPluginProjects`                                                            | 保留                               |
| 插件平台               | 发现、安装、启停、卸载、运行时 Surface 和贡献点                                          | plugin registry/runtime/protocol/server bootstrap                                        | 保留                               |
| 插件侧边栏             | 隐藏 Project 下展示已安装插件；右侧打开、再次点击收起                                    | sidebar plugin section/panel host                                                        | 适配                               |
| 插件导航关闭           | 打开其他页面或 Workspace 时关闭插件面板                                                  | `left-sidebar.tsx` selection store wiring                                                | 保留                               |
| 插件项目规范           | 自定义名称，绑定/创建 Project，默认 Provider/模型，复制和删除                            | plugin project models/UI/RPC                                                             | 保留                               |
| Agent 网页应用         | Agent 生成声明式界面，HTML 保存和浏览器预览                                              | agent web app plugin、HTML preview                                                       | 保留                               |
| HTTP 服务插件          | 多监听地址/端口、路由、默认异步任务 API、测试、回放、清理                                | workflow HTTP plugin、protocol、server manager                                           | 保留                               |
| HTTP 自定义处理节点    | 每个请求路径可选择现有 Workflow 或直接配置 Workflow 节点                                 | `http-service-handler-fields.tsx`、`PluginHttpHandlerSchema`、inline workflow runtime    | 适配                               |
| 字节开发插件           | PRD→方案→指令→开发→Review→部署→测试→发布                                                 | byte-development plugin/workflows/skill                                                  | 保留                               |
| Meego PRD              | 登录授权、选择 Meego、抓取并回填 PRD                                                     | development Meego client/workflow                                                        | 保留                               |
| 字节对账插件           | 对话生成/修改对账，测试和比对                                                            | byte-reconciliation plugin/skill                                                         | 保留                               |
| 灵动岛                 | macOS 刘海常驻、未读计数、悬停详情和清除                                                 | desktop dynamic island host                                                              | 保留                               |
| Aiden Claude 思考翻译  | 仅翻译英文 thinking；中文 text 原样；默认折叠 thinking                                   | provider settings、reasoning translation service、stream renderer                        | 保留                               |
| 活跃回合恢复           | 心跳或重连不丢首条指令和正在执行的 turn                                                  | agent manager/host runtime                                                               | 保留                               |
| 上下文压缩队列         | 压缩中展示状态，用户消息排队并在完成后继续                                               | composer/agent runtime compaction                                                        | 保留                               |
| 历史输入导航           | 聊天侧边轨道按用户输入跳转，展开不跳到顶部                                               | chat outline rail/e2e                                                                    | 适配                               |
| 改动文件与 Review      | 展示改动文件、逐文件 Diff、审核、撤销                                                    | changes tree、working diff、review store/surface                                         | 适配                               |
| Explorer 四类入口      | 文件、改动、任务摘要、Pull Request 均可打开                                              | panel manifest/registry/launcher/compact explorer                                        | 适配                               |
| 任务摘要               | 右侧展示待办、任务产出和参考信息                                                         | task-summary panel/model                                                                 | 适配                               |
| 子 Agent 通知          | 已识别 task notification 归入 Subagents，不污染主时间线                                  | Claude subagent projection                                                               | 保留                               |
| 默认中文界面           | 本分支新增默认文案使用简体中文                                                           | i18n resources、插件文案、开发规范                                                       | 适配                               |

## 自动审计门禁

以下接线必须由回归测试持续覆盖：

1. App 根路由注册 Workflow、记忆详情路由和插件面板宿主。
2. 左侧栏注册 Workflow、已安装插件区，并在普通导航时关闭插件面板。
3. 主机设置注册连接、配对、助手、记忆、MCP、Skill、渠道、插件和全局知识。
4. Project 设置注册 Project 记忆、知识、飞书群、关联插件和父 Project 跳转。
5. Explorer 注册文件、改动、任务摘要、Pull Request，以及对应 panel manifest、registry 和 launcher。
6. Protocol 导出插件 HTTP handler，并支持 Workflow 与自定义节点两种模式。
7. Server 声明 Project 层级、记忆、Workflow、插件、飞书和翻译相关 capability，并完成 session/bootstrap 接线。
8. 主机概览必须保留外观设置，避免共享页面恢复时被全局知识配置覆盖。

## 2026-08-28 审计结果

- rebase 前和 rebase 完成提交的 tree 完全一致。
- rebase 前存在的实现文件在当前分支中没有整文件删除。
- 当前测试文件数量比 rebase 前增加 5 个，没有测试文件丢失。
- 对共享 TSX 文件中被删除的组件引用进行反向扫描后：
  - `HostPairDevicePage`/`PairDeviceRow` 已由 `PairDeviceSection` 适配替代；
  - `HostAppearanceSection` 属于真实入口丢失，本轮已重新接回主机概览。
- 新增 App、Protocol、Server 三层接线门禁，覆盖 Workflow、插件、记忆、Project、Explorer、capability 和服务注册。
- 验证结果：
  - App：711 个测试文件、5379 项测试全部通过；
  - Protocol：78 个测试文件、728 项测试全部通过；
  - Server 关键功能：Workflow、记忆、Project 飞书上下文、HTTP 插件共 84 项测试通过；
  - Server 接线与守护进程监督门禁：9 项测试通过；
  - 全仓 TypeScript typecheck 通过；
  - 本轮修改的格式检查和 lint 通过。
