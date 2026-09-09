# Argos Alarm Runner Contract

## 固定默认值

- 群 ID：`oc_2aea267fe6e721607f906b14a69eb65b`
- 扫描窗口：最近 24 小时，半开区间 `[start, end)`
- 归因目录：`https://bytedance.larkoffice.com/wiki/ThOkwhi0HiChgWko6jhc74yen1d`
- 日报 Base：runner 使用内置 canonical schema 直接创建空 Base，不复制模板。
- 排查 SOP：`https://bytedance.larkoffice.com/wiki/Xmw8wr79Cio6Fhkzn5NcBgdWnHh`
- 本项目时间展示、扫描窗口说明和日报归属说明默认使用北京时间。

## 数据与状态

- `unique_id` 固定等于 Argos `rule_id`，作为日报 Base 的规则级去重键；不得使用飞书 `message_id` 或其它拼接值。
- `result_id` 表示单次报警实例，优先使用 Argos `alert_group_id`，缺失时使用 `problem_id`。
- 同一日报 Base 内同一 `rule_id` 的多次报警只写入第一条记录；后续实例保留在扫描审计产物中，但不重复入表或启动排查。
- 单条排查输入由 `prepare-single-troubleshoot-data` 生成，必须自动查找当前 `date_key` 前两天同 `rule_id` 的
  `succeeded` 记录，并在 `recent_rule_investigations[]` 中提供 `ai_summary`、`ai_result` 和可读取的排查文档 Markdown。
  同时必须写入 `recent_rule_investigation_policy`，明确历史结论只作为待验证假设和取证路径参考，不能未经本次证据校验直接复用。
  历史文档读取失败不得阻断本次排查，但必须写明 `doc_fetch_status` 和原因。
- 日报 Base 标题日期固定优先使用 `result_time` 对应的 `YYYYMMDD`；仅当报警无 `result_time` 时才回退消息发送时间。
- 扫描窗口说明与消息时间按北京时间汇报；若消息发送日期和 `result_time` 日期不同，runner 必须在
  `daily_results[]` / `upsert-plan.json` 中写出 `date_key_reason`、`result_time_date_keys` 和
  `message_date_keys`，避免“最近消息写入旧日期日报”被误判。
- 新记录状态为 `init`。
- 父会话认领后状态为 `processing`，同时写入 `ai_session_id`。
- 终态为 `succeeded`、`pending` 或 `failed`。
- `processing` 记录只能由 runner 恢复：默认仅恢复同 `ai_session_id` 且超过 `processing_max_age_minutes`
  的记录；跨 session 恢复必须同时指定 `result_id`、`force_by_result_id` 和 `apply`。
- 结果 JSON 必须包含固定枚举 `attribution_result`，取值只能是：
  `[有效告警]消费积压-机房波动`、`[有效告警]消费积压-消费能力不足`、`[有效告警]上游流量波动`、
  `[有效告警]下游依赖异常`、`[无效告警]规则不合理`、`[无效告警]通知频次不合理`、
  `[待确认]证据不足`、`[失败]排查基础设施失败`。
- `succeeded` 必须包含非空 `ai_summary`、合法的飞书 `ai_result` 文档链接、`rule_id` 和 `rule_name`。
- `succeeded` 必须声明 `writeback_owner="parent_orchestrator"`，并提供 `evidence_items[]`
  或 `investigation_evidence[]`。每条证据至少包含来源/类型和可复核摘要；禁止只写结论而没有证据。
- `evidence_items[].category` 会被 runner 归一化为 `argos_rca`、`metric`、`log`、`trace`、
  `change`、`dependency`、`config` 等类型。`succeeded` 结果至少需要 `argos_rca|metric`
  中的一类平台证据和第二类佐证证据；`[有效告警]下游依赖异常` 必须额外包含
  `dependency|log|trace`；消费积压类归因必须额外包含 `metric|log`。
- close 前必须存在独立审查文件：`<result_id>.review.json` 或 `review-<result_id>.json`。审查文件必须包含
  `review_passed`、`blockers[]`、`required_rework_prompt`、`checked_files[]`、`validation_command`、
  `review_summary`。`review_passed=false`、缺字段或 JSON 无法解析时，runner 不允许 close。
- `close-work-item` 会按 Bamboo 对账模式统一执行：将 `ai_result` 归档为当前日报 Base Wiki 节点下的 `result_id:rule_name:date排查结果` 子文档、沉淀总 SOP、沉淀 `rule_id:rule_name排查sop` 子文档、写 Base 终态、回复原报警群消息。
- 调试时可在 `close-work-item` 或 `close-ready-work-items` 传 `--skip-message-reply`，仅跳过原报警群消息回复，并在 `extra` 中记录 `message_reply_status=skipped`、`message_reply_reason=skip_message_reply enabled`；该参数不得跳过 Base 终态、排查文档归档、总 SOP 或规则 SOP 写回。
- Base 顶层字段只保留业务状态和 AI 摘要/文档链接；`total_sop_writeback_status`、`total_sop_writeback_reason`、`sop_writeback_status`、`sop_writeback_reason`、`sop_doc_url`、`sop_doc_token`、`card_update_status`、`card_update_reason`、`message_reply_status`、`message_reply_reason` 等通知/SOP/归档明细必须写入 `extra`，不得作为独立字段写入日报 Base。
- 排查结果显式提供 `total_sop_markdown` / `total_sop_suggestion` / `rule_sop_markdown` 时优先使用，但这些字段必须是可复用 SOP 知识，不得是排查结果正文。缺失时 runner 必须派生最小 SOP 内容后写回，禁止静默跳过。
- 总 SOP 只沉淀 Argos 领域通用知识，例如报警字段识别、通用取证顺序、指标/日志/trace/变更核验口径和跨规则注意事项；不得写入单个 `rule_id` 的专属指标、样本、排查结果或处理建议。
- 规则 SOP 只沉淀对应 `rule_id` 的规则特有知识，例如适用范围、稳定指标维度、日志关键词、依赖服务、平台状态入口、常见原因和反例口径；不得写入 `result_id`、结果文档链接、一次性报警明细、临时处置结论或“本次摘要”。
- Argos 原始报警卡片当前不做真实编辑：飞书通用 `messages.patch` 只能更新同应用发送的 interactive card，而 Argos 报警卡片不是本 runner 的 bot 发送；仓库也没有受控 Argos `update-card` 内部 CLI。runner 会写入 `card_update_status=skipped` 和明确原因，保留通知层审计字段。
- 规则 SOP 只按 `rule_id:` 前缀定位，命中则更新，不存在才创建，禁止按相似标题复用。
- `close-work-item` 在任何写副作用前都会执行与 `validate-result-dir` 相同的结果校验；校验失败禁止写 Base、SOP 或群消息。
- 最终宣布完成前必须执行 `auto-troubleshoot-drain` 生成 `run-summary.json`，且
  `ready_to_report_complete=true` 后再执行 `render-run-report` 生成面向用户的汇总。

## 写入所有权

- runner 负责群消息解析、日报 Base 定位或创建、字段校验、幂等写入、认领和终态回写。
- 排查子 Agent 只负责证据采集、文档和本地结果 JSON。
- 审查子 Agent 只读，不执行 Base、SOP 或群消息写入。
- 父会话通过 runner 是最终回写所有者。
- 父会话认领后必须运行 `split-work-items`，由 runner 生成 `work-items.json`、
  `work-items-<result_id>.json`、`dispatch-plan.json` 和 `auto-orchestrator-state.json`；
  禁止 agent 手写拆分文件。
- 群扫描阶段传入 `resultDir` 时，runner 必须写 `messages.jsonl`、`alerts.jsonl` 和
  `upsert-plan.json`，作为审计与重放事实源；禁止由 agent 从聊天内容手工重建这些中间产物。
- 群扫描阶段可传 `levels` 和 `psms` 过滤条件，CLI 形式为 `--levels critical,warning` 和
  `--psms life.settle.gateway,life.settle.ledger_facade`。两个维度同时传入时必须同时命中才处理；
  任一维度未传则不限制该维度。`messages.jsonl` 保留扫描到的原始消息，`alerts.jsonl`、
  `upsert-plan.json` 和 Base 写入只包含过滤后本轮实际处理的报警。
- `groups-scan-and-troubleshoot` 中间态只能写 `groups-scan-and-troubleshoot.json`；`run-summary.json`
  保留给 `auto-troubleshoot-drain --output-file <resultDir>/run-summary.json`。`render-run-report`
  必须拒绝非 drain summary，不能把扫描/认领中间态当最终报告。
- 恢复中断会话时必须先运行 `resume-auto-orchestration`，只按其 `next_action` 推进。
- 父会话在 close 前必须先运行 `validate-result-dir`；若 `per_result_close_readiness.*.ready_for_close=false`，
  必须修复结果 JSON 或文档后再 close。
- 批量回写优先使用 `close-ready-work-items`，该命令只 close review 和 validator 均通过的结果，
  并把每条 close 审计写入 `close-<result_id>.json`。
- 单条排查输入、文档发布、SOP 发布和可机械修复的结果 JSON 归一化必须走 runner 原子工具：
  `inspect-result`、`prepare-single-troubleshoot-data`、`publish-troubleshooting-doc`、
  `publish-sop-doc`、`normalize-model-result-json`、`normalize-result-doc-links`。
- runner CLI 的 JSON 输入参数必须支持 Bamboo 同款空格形式和等号形式：`--input-file path`、
  `--input-file=path`、`--input-json '<json>'`、`--input-json='<json>'`。`prepare-single-troubleshoot-data`
  必须能直接消费 `split-work-items` 生成的 `work-items-<result_id>.json` 数组文件，默认取其中唯一 work item。
- 日报 Base 健康检查走 `doctor-daily-base`。该命令只报告 schema、visible fields、主字段、
  dashboard 和 workflow 状态，并生成只读 `cleanup_plan`；不得自动删除 dashboard 或停用 workflow。
- 历史 Base 的主字段如果不是 `unique_id`，doctor 只能标记 `primary_field.reason_code=historical_primary_field_drift`
  且 `blocking=false`，并给出人工迁移 `repair_plan`；新建 Base 必须继续以 `unique_id` 作为主字段。

## 飞书调用

只允许通过 `bytedcli --json lark ...` 操作飞书。群历史消息先使用机器人身份；只有明确返回
`bot identity is not allowed` 时才回退用户身份。禁止直接调用 Feishu OpenAPI，禁止新增 token
交换逻辑或本地 Feishu wrapper。

## 原子结果

结果先写 `<result_id>.json.tmp`，完成后 rename 为 `<result_id>.json`。未完成文件、缺失文档链接、
记录 session 不匹配或 `record_id` 缺失时禁止 close。
