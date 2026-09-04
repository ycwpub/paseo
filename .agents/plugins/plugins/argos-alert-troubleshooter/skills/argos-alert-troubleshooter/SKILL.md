---
name: argos-alert-troubleshooter
description: Autonomously investigate Argos alerts from configured Lark groups using Project knowledge and a troubleshooting SOP.
---

# Argos 报警自动排查

本插件以 Paseo Project 为核心，监听指定飞书群的 Argos 报警卡片，并由 Agent
结合排查 SOP、Project 知识和可用研发工具自主完成排查与归因记录。

## 强制执行规范

1. 先读取插件项目配置的排查 SOP 飞书文档。
2. 保留告警原始消息 ID、群 ID、时间、规则、服务和链接，使用消息 ID 去重。
3. 根据告警线索自主选择可用工具检查指标、日志、trace、变更、代码、依赖和历史事件。
4. 不得只复述告警。输出必须包含：
   - 现象与影响范围
   - 时间线
   - 已验证证据
   - 根因，或带验证方法的候选假设
   - 处置建议
   - 后续行动
5. 完成后更新配置的归因记录飞书文档，附上关键查询条件和证据链接。
6. 某项数据无权限或工具不可用时，记录阻塞项并继续使用其余证据，不得卡住整个任务。
7. 临时文件放在当前 Project 的 `.tmp/` 目录。

## 扫描窗口

定时补偿扫描使用半开窗口：

```text
start = now - lookbackMinutes
end   = now - excludeRecentMinutes
```

默认扫描两小时内、排除最近半小时。实时监听覆盖最近消息，定时扫描负责补偿漏事件。

## Project 约束

- 排查 Agent 必须创建在插件项目所绑定的 Project 中。
- Provider、模型、助手和团队以插件项目配置为准。
- 排查会话保留在 Project 中供用户继续沟通，不自动归档。
