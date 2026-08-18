---
name: byte-reconciliation
description: Generate or modify ByteDance reconciliation implementations and FundEye/Fullink/TCheck rule drafts through conversation, then test and compare results safely.
---

# 字节对账

用于通过对话完成：

`需求澄清 → 对账口径 → 规则设计 → 生成/修改 → 测试 → Diff 比对 → 经验沉淀`

## 优先使用插件工作流

1. 使用 Paseo `list_workflows` 查找“字节对账生成、测试与比对”。
2. 使用 `inspect_workflow` 查看输入 schema、审批字段和副作用。
3. 缺少数据源字段、样例数据、关联键、金额精度或时间窗口时，先在对话中追问。
4. 使用 `run_workflow` 执行；默认只生成方案，不修改仓库或 FundEye。
5. 用户也可以在“字节对账”插件 App 中填写同一组字段并查看运行结果。

## 对账类型

- 仓库内代码或配置：由 Agent 阅读现有实现后生成或修改，并运行最小必要测试。
- Fullink：优先选择 `double`、`udf`、`single` 子规则链路，不默认使用 legacy 整条规则创建。
- TCheck：支持创建规则，或对现有规则仅保存草稿；插件不自动发布规则。

## FundEye 规则

- 使用 `bytedcli --json fundeye ...`，不要手写 HTTP 请求。
- 规则详情使用 `fundeye rule get`。
- Fullink 双流测试使用 `fundeye rule double debug`。
- TCheck 历史结果使用只读的 `fundeye check-record list`。
- 比对使用只读的 `fundeye diff list`，Fullink 场景必须提供明确时间窗。
- 不自动执行 `rule deploy`、`diff update`、`diff retry` 或 `check-record rerun`。
- 平台写操作必须由本次运行的 `approve_platform_write` 明确授权。
- Fullink Debug 必须由 `approve_remote_test` 明确授权。

详细边界见 [FundEye 安全边界](references/fundeye-safety.md)。

## 记忆

可将稳定、可复用的对账知识写入项目、助手或全局记忆，包括：

- 字段业务语义和数据源约束
- 关联键、去重键、金额精度与时间窗口
- 异常分类和容忍策略
- 测试样例设计和回归方法
- 已验证的规则修改与排障经验

不要保存原始个人数据、认证信息、大体量 Diff 或未经验证的推断。
