# FundEye 安全边界

## 默认允许

- `bytedcli --json fundeye rule get`
- `bytedcli --json fundeye check-record list`
- `bytedcli --json fundeye diff list`
- 仓库只读分析和测试方案生成

## 必须显式确认

- 修改仓库文件
- 创建 TCheck 规则
- 保存 TCheck 规则草稿
- 创建或更新 Fullink 子规则
- 执行 Fullink 双流 Debug
- 执行用户提供的本地测试命令

确认只对当前 Workflow 输入和当前运行有效，不能从记忆或历史会话推断。

## 插件不自动执行

- TCheck `rule deploy`
- Diff 标记、处理或重试
- 历史核对记录重跑
- 任意未列入适配器白名单的 FundEye 命令
- 手写 FundEye HTTP API

## 数据安全

- 不把 Token、JWT、Cookie、认证头写入 prompt、artifact 或 memory。
- 样例数据应脱敏，避免包含身份证、手机号、银行卡、真实订单或支付凭证。
- Memory 只保存规则口径和验证结论，不保存原始 Diff 明细。
