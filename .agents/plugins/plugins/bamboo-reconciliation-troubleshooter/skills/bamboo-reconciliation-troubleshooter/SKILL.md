---
name: bamboo-reconciliation-troubleshooter
description: Configure and operate a Project-scoped Bamboo reconciliation alert troubleshooting service.
---

# Bamboo 对账自动排查

本插件以 Paseo Project 为核心，监听指定飞书群的 Bamboo 报警卡片，并通过
`life-settle-ai-assistant` 已沉淀的能力完成扫描、排查、归因记录和 SOP 更新。

## 强制执行规范

1. 群消息扫描必须调用：

   ```bash
   life-settle-ai-assistant bamboo-alerts-to-excel
   ```

2. 自动排查必须先读取：

   ```bash
   life-settle-ai-assistant bamboo-alerts-auto-troubleshoot
   ```

3. 单条报警排查必须遵循：

   ```bash
   life-settle-ai-assistant bamboo-alert-troubleshooter
   ```

4. 不手工解析 Bamboo 卡片，不手工创建或更新日报 Base，不手工回写 Bamboo
   卡片或原群消息，不直接调用飞书 OpenAPI。
5. 临时文件放在当前 Project 的 `.tmp/` 目录。
6. 扫描和排查必须使用插件项目配置中的飞书群、SOP 文档和归因记录目录，不得臆造。

## 扫描窗口

定时补偿扫描使用半开窗口：

```text
start = now - lookbackMinutes
end   = now - excludeRecentMinutes
```

默认扫描两小时内、排除最近半小时。实时监听用于覆盖最近消息，CLI 内部通过
`result_id` 和日报 Base upsert 保证幂等。

## Project 约束

- 排查 Agent 必须创建在插件项目所绑定的 Project 中。
- Provider、模型、助手和团队以插件项目配置为准。
- 排查会话保留在 Project 中供用户继续沟通，不自动归档。
