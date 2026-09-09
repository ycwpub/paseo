---
name: bamboo-reconciliation-troubleshooter
description: Configure and operate a Project-scoped Bamboo reconciliation alert troubleshooting service.
---

# Bamboo 对账自动排查

本插件以 Paseo Project 为核心，监听并补偿扫描指定飞书群的 Bamboo 报警卡片。
消息先按 `result_id` 幂等写入归因记录日报 Base，再进入 Project 本地持久队列，由
`life-settle-ai-assistant` Runner 契约和三个独立 Agent 异步处理。

## 强制执行规范

1. 单条报警排查必须遵循：

   ```bash
   life-settle-ai-assistant bamboo guide alert-troubleshooter
   ```

2. 不手工解析 Bamboo 卡片，不手工创建或更新日报 Base，不手工回写 Bamboo
   卡片或原群消息，不直接调用飞书 OpenAPI。
3. 临时文件放在当前 Project 的 `.tmp/` 目录。
4. 扫描和排查必须使用插件项目配置中的机器人、飞书群、SOP 文档和归因记录目录，
   不得读取默认机器人环境或臆造配置。
5. 非离线 Hive 规则在 Agent 启动前写为 `not_support`，并保留 `rule_type` 和权威样本数口径。

## 入表和队列

- 实时监听和定时扫描发现的报警都先按原始 `result_id` 幂等写入日报 Base。
- 入表成功后写入 `~/.paseo/projects/<projectId>/plugin-data/<pluginId>/alert-queue.json`。
- 队列串行消费；队列为空时，按配置间隔和日期回溯范围分页获取全部未认领记录。
- 监听、扫描、自动排查可以独立关闭；手动指定 `result_id` 或多维表格记录仍可用于调试。
- 自定义处理提示词支持内置变量和 Project `variables`。
- 瞬时外部错误按配置间隔最多自动重试三次；权限、记录契约、证据和审核阻塞进入
  `pending`；程序错误停止自动重试。

## 扫描窗口

定时补偿扫描使用半开窗口：

```text
start = now - lookbackMinutes
end   = now - excludeRecentMinutes
```

默认扫描最近两小时的全部消息，不排除最近消息。实时监听与定时扫描可能重叠，
日报 Base 和本地队列按消息/记录 ID 去重。每次扫描保存逐群原始消息、匹配记录、
忽略计数和失败信息到 Project `.tmp/bamboo-scan-audits/`。

## Agent 与 Runner

- 排查、SOP 汇总和审核使用三个独立上下文，只通过原子写入的本地文件传递信息。
- 只有审核通过且 Runner 校验成功后，父编排器才发布文档、写回 SOP、关闭 Base
  记录、更新 Bamboo 卡片和回复群消息。
- 最后依次执行 `auto-troubleshoot-drain`、`final-drain-check` 和
  `render-run-report`。任务页保留结构化报告和审计文件位置。
- 增强排查 Skill、参考飞书文档和日期回溯范围仅属于 Bamboo 配置。

## Project 约束

- 排查 Agent 必须创建在插件项目所绑定的 Project 中。
- Provider、模型、助手和团队以插件项目配置为准。
- 默认保留排查会话供用户继续沟通；项目可选择在整个任务尝试进入终态后归档本次
  创建的排查、SOP 汇总和审核 Agent。
