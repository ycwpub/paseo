---
name: byte-development
description: Orchestrate ByteDance development from PRD through technical design, implementation, review, BITS deployment, testing, release, and reusable Paseo memory.
---

# 字节开发

用于把一个明确需求推进为可审计的研发流程：

`Project 设置 → PRD → 技术方案 → Agent 指令 → 开发 → Review → 部署 → 测试 → 发布`

执行 PRD 分析前，先通过流程中的“Project 设置”节点补充代码目录、通用知识、
规范知识、项目专有知识和其他 Project 上下文。Project 设置是配置入口，不属于 Workflow
运行阶段，也不产生节点运行记录。

创建开发任务时填写流程名称，选择或创建 Project，并选择默认 Provider 和模型。
任务创建后，进入“PRD”节点直接输入 PRD、粘贴 Meego 链接或选择当前用户关联的
Meego；确认 PRD 后再启动研发 Workflow。其他依赖 Agent 的配置在任务保存后维护，
不要阻塞插件项目的首次保存。

## 优先使用插件工作流

1. 先用 Paseo `list_workflows` 查找“字节开发全流程”。
2. 用 `inspect_workflow` 阅读输入 schema、副作用和审批字段。
3. 使用 `run_workflow` 执行；需要后台执行时保留 run id 并轮询结果。
4. 若用户在插件 App 中操作，先填写自定义研发流程名称，选择已有 Project 或创建新
   Project，并选择默认 Provider 和模型；创建任务后进入 PRD 节点填写需求并启动流程。

Project 是插件的核心上下文。研发页面、日常对话、Agent 指令、Workflow、流程历史和
项目记忆都归属于 Project；代码目录和三类 Project 知识由 Project 设置统一维护。
Project 知识默认不能修改，只有用户在当前对话中明确要求更新 Project 知识时才能修改。

## BITS 规则

- 使用 `bytedcli --json bits ...`，不要手写 HTTP 请求。
- Dev Task 创建必须路由官方 `bits-devops-dev-task` skill 的
  `prepare → confirm → submit` 流程，不在本插件复制创建逻辑。
- Review 优先使用 `bits-code-guard`；未安装时可安装该官方 skill，或至少读取
  `bytedcli code-review rule list` / `workflow list` 的仓库规则。
- BITS 写操作必须先 dry-run，并在用户明确确认后才使用 `--yes`。
- 未确认测试时不得触发 `quick-run`。
- 不跳过 Gatekeeper、QCSS 或其他发布门禁。
- 不把 Token、JWT、Cookie、认证头或临时调试日志写入 Workflow 输出或记忆。

完整安全说明见 [BITS 安全边界](references/bits-safety.md)。

## 记忆

插件可把稳定知识写入以下一个或多个作用域：

- `global`：跨项目长期有效的研发偏好和组织规范。
- `project`：当前项目的架构决策、约束、接口和发布经验。
- `assistant`：某个助手应长期遵守的工作方式。

只保存可复用结论；不要保存密钥、瞬时流水线状态、原始大日志或未经验证的猜测。
