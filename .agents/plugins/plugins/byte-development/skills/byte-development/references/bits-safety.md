# BITS 安全边界

## 允许自动执行

- `bytedcli --json bits develop get`
- `bytedcli --json bits develop project deploy ... --dry-run`
- `bytedcli --json bits develop publish ... --dry-run`
- 只读的 Code Review 规则与工作流查询

## 必须显式确认

- `bytedcli --json bits develop project deploy ... --yes`
- `bytedcli --json bits develop quick-run ...`
- `bytedcli --json bits develop publish ... --yes`
- 任何会创建、更新、关闭、绑定、通过阶段或改变流水线状态的操作

确认只对当前 Workflow 输入和当前运行生效，不能从历史记忆推断，也不能由 Agent
自行补全。

## 禁止

- 手写 BITS HTTP API
- 把认证材料写入 prompt、日志、artifact 或 memory
- 自动绕过 Gatekeeper/QCSS
- 未检查 Dev Task 状态就真实发布
- 对真实写操作做不可控重试
