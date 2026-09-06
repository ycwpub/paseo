---
name: bamboo-reconciliation-troubleshooter
description: Configure and operate a Project-scoped Bamboo reconciliation alert troubleshooting service.
---

# Bamboo 对账自动排查

本插件以 Paseo Project 为核心，监听并补偿扫描指定飞书群的 Bamboo 报警卡片。
消息先写入配置的多维表格，再进入 Project 本地持久队列，由
`life-settle-ai-assistant` 已沉淀的单条排查能力异步处理。

## 强制执行规范

1. 单条报警排查必须遵循：

   ```bash
   life-settle-ai-assistant bamboo-alert-troubleshooter
   ```

2. 不手工解析 Bamboo 卡片，不手工创建或更新日报 Base，不手工回写 Bamboo
   卡片或原群消息，不直接调用飞书 OpenAPI。
3. 临时文件放在当前 Project 的 `.tmp/` 目录。
4. 扫描和排查必须使用插件项目配置中的飞书群、SOP 文档、消息多维表格和归因记录目录，不得臆造。

## 入表和队列

- 实时监听和定时扫描发现的报警都先按消息 ID 幂等写入消息多维表格。
- 入表成功后写入 `~/.paseo/projects/<projectId>/plugin-data/<pluginId>/alert-queue.json`。
- 队列串行消费；队列为空时，按配置间隔从多维表格获取未认领记录。
- 监听、扫描、自动排查可以独立关闭；手动指定的多维表格记录仍可用于调试。
- 自定义处理提示词支持内置变量和 Project `variables`。

## 扫描窗口

定时补偿扫描使用半开窗口：

```text
start = now - lookbackMinutes
end   = now - excludeRecentMinutes
```

默认扫描最近两小时的全部消息，不排除最近消息。实时监听与定时扫描可能重叠，
消息多维表格和本地队列按消息/记录 ID 去重。

## Project 约束

- 排查 Agent 必须创建在插件项目所绑定的 Project 中。
- Provider、模型、助手和团队以插件项目配置为准。
- 排查会话保留在 Project 中供用户继续沟通，不自动归档。
