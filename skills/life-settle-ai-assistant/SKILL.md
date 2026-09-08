---
name: "life-settle-ai-assistant"
description: "Guides settlement troubleshooting through the life-settle-ai-assistant CLI. Invoke for settlement, Bamboo alert, PSM, or recorded RPC workflows."
---

# Life Settle AI Assistant

当用户请求涉及以下场景时使用本 skill：

- 结算排障
- Bamboo 报警排查
- PSM 或服务名到代码仓库定位
- `@byted/life-settle-ai-assistant` 记录的只读 RPC 查询流程
- 结算 AI assistant 已沉淀的业务排查流程

## 使用方式

先列出可用能力：

```bash
life-settle-ai-assistant list
```

根据用户场景选择对应一级 CLI 或顶层 skill。每一级 CLI 都有自己的 `list`、`show`、`guide`：

```bash
life-settle-ai-assistant guide <top-level-skill-name>
life-settle-ai-assistant bamboo list
life-settle-ai-assistant bamboo guide <bamboo-skill-name>
life-settle-ai-assistant tce list
life-settle-ai-assistant tce <service.name> rpc
```

`guide` 输出会自动包含共享项目上下文和具体业务 skill。执行任何业务排查、Bamboo 报警、PSM 定位或 RPC 查询前，必须先遵循该输出里的 `Shared project context`，再执行 `Instructions` 中的具体流程。

例外：`bamboo groups-scan-and-troubleshoot` 是受控 Bamboo CLI 指令。需要执行“扫描落表 + 目录排障”闭环时，先运行 `life-settle-ai-assistant bamboo groups-scan-and-troubleshoot ... --preflight-only` 或 `--dry-run`，preflight 会验证 PATH 上的全局 CLI 是否已经支持该子命令，正式执行仍由 runner 状态机和主会话按 `dispatch_plan` 派发子 agent。扫描落表细节由 runner 内部阶段处理；不要让 agent 读取扫描落表参考文档后手工解析群消息、复制模板或调用内部 runner 阶段。命令维护参考文档位于包内 `skills/bamboo/references/bamboo-alerts-to-base.md`，不作为子 skill 暴露。

这些 Bamboo 受控子命令启动 runner 前会调用 `scripts/bamboo/bamboo-alert-preprocess.mjs` 统一预处理环境变量：把 `FEISHU_BOT_APP_ID` / `FEISHU_BOT_APP_SECRET` 映射为 `FEISHU_APP_ID` / `FEISHU_APP_SECRET` 和 `LARK_CLI_APP_ID` / `LARK_CLI_APP_SECRET`，清理旧 `LARKSUITE_CLI_*` 凭证并设置 `LARKSUITE_CLI_STRICT_MODE=off`。不要在 agent 步骤、shell wrapper 或子 skill 中重复实现环境变量处理。

例如：

```bash
# 业务 skill
life-settle-ai-assistant bamboo guide alert-troubleshooter
life-settle-ai-assistant guide psm-to-code-repository

# Bamboo 受控 CLI
life-settle-ai-assistant bamboo groups-scan-and-troubleshoot --group-id oc_xxx --scan-dir-url https://bytedance.larkoffice.com/wiki/xxx --preflight-only
life-settle-ai-assistant bamboo groups-scan-and-troubleshoot --group-id oc_xxx --scan-dir-url https://bytedance.larkoffice.com/wiki/xxx --dry-run

# RPC 服务（统一使用 tce 三级格式）
life-settle-ai-assistant tce life.settle.bill rpc
life-settle-ai-assistant tce life.settle.ledger rpc
life-settle-ai-assistant tce list               # 列出所有 RPC 服务
```

读取 CLI 输出的 skill 指引后，再按指引继续处理用户请求。RPC 类 skill 统一使用 `life-settle-ai-assistant tce <service.name> rpc` 格式；`show` / `guide` 是 `<service.name>` 下的子命令。

<!-- life-settle-ai-assistant:generated-routes:start -->

## 能力路由（自动生成，请勿手改）

> 本区块由 `npm run generate:routes` 从 skill registry（`skills/` 下各 SKILL.md 的 frontmatter）生成；新增、删除或修改 skill 后必须重新运行该命令，不要手工编辑。

### 工作流 skill

- `life-settle-ai-assistant bamboo guide alert-troubleshooter` — 当外部结算助手需要排查单个 Bamboo result_id/bamboo_url，或分析飞书 Base 中的结算对账报警记录并生成报告时使用。
- `life-settle-ai-assistant bamboo guide alerts-auto-troubleshoot` — 当外部结算助手需要处理 Bamboo 报警日报 Wiki 目录、逐条认领记录、调用单条排障、回写 Base、归档文档并做可选通知时使用。
- `life-settle-ai-assistant guide bamboo-alert-groups-scan-and-troubleshoot` — 当外部结算助手需要按多个飞书群扫描 Bamboo 报警入 Base，并继续排查近两天未处理或失败报警时使用。（兼容历史一级 skill 入口）
- `life-settle-ai-assistant guide psm-to-code-repository` — 当外部结算助手需要把 TCE 服务 PSM 或服务名解析为 Codebase 仓库路径时使用。

### RPC 服务

共 43 个只读 RPC 服务，统一通过 `life-settle-ai-assistant tce <service.name> rpc` 调用；运行 `life-settle-ai-assistant tce list` 查看完整服务清单。

### 确定性 CLI 子命令（runner 支撑，不作为 skill 暴露）

- `life-settle-ai-assistant bamboo groups-scan-and-troubleshoot --group-id <chat-id>[,<chat-id>...] --scan-dir-url <wiki-url> [--date-key <YYYYMMDD>] [--dry-run|--preflight-only]` — 扫描落表并生成目录排障受控编排计划；正式执行仍由 runner 状态机和主会话驱动。

<!-- life-settle-ai-assistant:generated-routes:end -->

## Bamboo 归因硬规则

处理 Bamboo 报警时，必须区分三类记录：

- `instance_status=运行失败` 且样本数为 0：按执行失败原因归因，例如表权限缺失、SQL 类型错误、依赖表不存在。
- `false_data_length > 0`、`task_result_num > 0` 或 `false_reason` 非空：必须基于规则 SQL、样本字段、`diff_reason`、错误码和 Bamboo 失败原因给出具体归因。
- `rule_type` 非 `hive` / `offline_hive` / `hive_task`：写 `not_support` 并说明能力边界。

对有效差异样本，禁止把以下文案作为 `succeeded` 结论：

- 当前规则无专用自动归因模板
- Bamboo 存在有效异常样本但当前规则无专用自动归因模板
- 需要继续按规则 SQL、异常样本和线上数据排查

没有规则专用模板或没有 RPC 权限时，也必须先使用 SQL 和样本字段做最合理固定归因；只有真正等待用户授权且有结构化 `pending_admission` 时，才允许 `pending`。

`batch-quick-closure-from-result-dir` 只用于已有 `<result_id>.json` 或 QC quick-closure 记录，不是通用深度归因入口。有效样本深度归因必须走 `prepare-auto-troubleshoot` → 单条排障 → `close-prepared-work-items`。

自动排障必须采用主会话编排状态机：扫描落表、`prepare-auto-troubleshoot`、排查子 agent 派发、审查子 agent 派发、`close-prepared-work-items` 和最终 drain 都由主会话执行。认领成功后的每个 work item 由主会话启动一个宿主原生 fresh context 排查子 agent 单条处理；排查子 agent 只产出结果 JSON、排查文档和具体规则 SOP，不执行 close、Base 回写、Bamboo 卡片回写或群消息回复。随后必须启动独立 fresh context 审查子 agent，只读检查该条 work item、结果 JSON、本地 Markdown、`publish-doc-${result_id}.json` / `${result_id}.doc.json` 最终发布审计、SOP 写回结果和 runner validation 输出；审查子 agent 不得 close 或执行任何写副作用。审查输出必须按原子协议写 `${result_id}.review.json.tmp` 后 rename 为 `${result_id}.review.json`，且包含 `review_passed`、`blockers[]`、`required_rework_prompt`、`checked_files[]`、`validation_command`、`review_summary`。`review_passed=false`、缺 review audit、缺最终 publish audit、最终 `mergedMarkdown` 仍含 `TBD|TODO|请填写|填写指引|骨架必含节|骨架自动生成|请引用 build-attribution-candidates` 等占位内容时，主会话不得 close。自动目录结果 JSON 必须声明 `writeback_owner="parent_orchestrator"`；缺失、写成子 agent，或描述为“用户要求不回写”都会被 validator 拦截。禁止把“扫描 + 批量排查 + close”整体交给一个子 agent，也禁止用本地 worker、LLM SDK、agent wrapper 或队列服务替代宿主子 agent。

批量排障若先把日报归因记录下载到本地 CSV，CSV 只能作为候选源；正式处理前必须回到 runner 调用 `claim-next-work-item-from-daily-base-csv` 或 `prepare-auto-troubleshoot` 精确认领云端 Base 记录，取得真实 `record_id` 后才能派发单条。单条排障的数据准备优先使用 `prepare-single-troubleshoot-data`，由脚本解析 `bamboo_url` 中的 `id`、查询 Bamboo 结果、下载总 SOP 和规则 SOP；模型只基于本地材料排查。单条结果可通过 `write-local-troubleshooting-result` 写本地排查文档和规则 SOP，本地 close 包装 `close-single-troubleshoot-from-local` 只负责先更新规则 SOP 云文档，再委托现有 close 逻辑执行 Base、Bamboo 卡片和群消息回写。

飞书身份参数只能由 runner 内置身份路由处理。禁止用 PATH wrapper、alias、shell 函数或脚本全局改写 `bytedcli --json lark ... --as` 参数；strict-mode 兜底只允许按业务命令类型在 runner 中执行，避免 agent 自由发挥导致 bot/user 身份混用。

受控 drain 编排可以在 `prepare-auto-troubleshoot` 上显式传 `--auto-recover-stale-processing --processing-max-age-minutes 120 --ai-session-id "$AI_SESSION_ID"`，runner 只会自动恢复当前 session 且已超时的 stale processing，并通过 `auto_recovered_processing_records` 返回明细；其它 session 或未超时 processing 仍阻塞认领，跨 session 回滚必须继续使用 `--result-id --force-by-result-id --apply` 门禁。日报 Base 查找作用域固定为传入的 `scan_dir_url/root_path` 指定归因目录的一层子节点；不要查看、复用或因其它路径下同名 `YYYYMMDD-bamboo对账归因记录` 阻断当前目录。每轮 prepare 后必须用 `split-work-items` 生成 `work-items.json`、`work-items-${RESULT_ID}.json`、`dispatch_plan` 和 `auto-orchestrator-state.json`，禁止 agent 手写 Node one-liner 拆分；父 agent 只按 `dispatch_plan` 充当 agent-driver 派 fresh-context 子 agent，runner 不集成 LLM/agent SDK。恢复会话时必须先执行 `resume-auto-orchestration`，只按其 `next_action` / `next_action_command` / `next_dispatch_items` 推进；禁止 agent 根据文件列表自行判断。子 agent 结果必须先写 `${RESULT_ID}.json.tmp`，完整后 rename 为 `${RESULT_ID}.json`；遇到 `RESULT_JSON_INCOMPLETE` 只允许等待或重试，不得 close。优先用 `close-ready-work-items` 批量 close 当前 `ready_for_close=true` 的结果；每条 close 仍必须保存 `$MODEL_RESULT_DIR/close-${RESULT_ID}.json` 审计。最终宣布完成前，必须执行 `node scripts/bamboo/bamboo-alert-runner.mjs auto-troubleshoot-drain --scan-dir-url ... --date-key "$TODAY_DATE_KEY" --date-key "$YESTERDAY_DATE_KEY" --result-dir ... --work-items-file ... --output-file "$MODEL_RESULT_DIR/run-summary.json"`；drain 日期列表以 `dateKeyList` / `date_key_list` / repeated `--date-key` 为准，显式传单个日期只 drain 该日期，不自动扩展；未传日期时默认今天和昨天。只有 `run-summary.json` 中 `ready_to_report_complete=true` 且兼容字段 `final_drain.ready_to_report_complete=true` 才能声明本轮闭环完成，最终汇总必须优先转述 `render-run-report` 生成的 `run-report.json`，并引用 `run-summary.json.audit_files.close` 和 `run-summary.json.artifact_consistency`。`render-run-report` 必须展示 `scan.groups[]`、`daily_bases[]`、每条结果的 `sop_doc_url`、`business_close_status`、`card_update_status`、`message_reply_status` 和 `ready_to_report_complete_reason`。`artifact_consistency` 必须展示 `base_succeeded_records`、`active_wiki_docs`、`total_wiki_docs`、`extra_docs`、`missing_docs`、`duplicate_docs` 和只读 `cleanup_plan`；孤儿或重复文档清理只能进入待确认计划，不得自动删除、移动，也不得让 `ready_to_report_complete` 放行。

自动目录排障里 `feishu_doc_url` / `ai_result` 必须是挂在当前日报 Base Wiki 节点下的 `/wiki/` 链接；独立单条且无归档目标时才允许 `/docx/`。`validate-model-result-json` 会用 `auto_troubleshoot_doc_must_be_wiki_link` 前置拦截 docx 直链。历史结果若只有 docx 链接，必须执行 `normalize-result-doc-links`，基于 resultDir 内 `${result_id}.md` 或 `doc-${result_id}.md` 重新发布到正确 Wiki 节点后再 close；没有正文或父 Wiki 上下文时不得伪造归档成功。

结果 JSON 在 close 前必须能通过 `validate-result-dir` 的 `per_result_close_readiness` 检查，并优先读取 `repair_plan`。若 `ready_for_close=false`，`repair_plan.categories.auto_fixable` 可按 `blockers` 自动执行 `normalize-model-result-json` 补齐 `ai_result`、`feishu_doc_url`、`doc_url`、`doc_token`、`doc_archive_status`、`sop_writeback_status` 和 summary 关键词；如果 blocker 是 `doc_url_must_be_wiki_link`，执行 `normalize-result-doc-links` 重新发布到正确 Wiki 目录。`needs_rewrite` 必须重写结果或补证，`needs_permission` 必须授权或补替代证据，`fatal` 必须停止修复 runner 输入。`publish-troubleshooting-doc --output-file` 会写 `<out>.preview.json` 和 `<out>.json`，只有 `<out>.json` 代表真实发布终态，禁止把 preview 当作已发布结果。

样本数归一化必须按权威优先级处理：`Bamboo false_data_length > false_reason.length > Base task_result_num > 卡片解析 > unknown`。任一高优来源为正数时禁止回退成 `0` 或 `unknown`；来源不一致必须记录 `sample_count_conflict`，禁止 QC 快速闭环。若 `ai_summary` 或 `sample_checks` 表示存在样本，`sample_count_authority.source` 不能是 `unknown`，否则 validator 会返回 `sample_count_authority_unknown_with_sample_evidence`。QC-1 零样本快速闭环只允许在 Bamboo 与 Base 都明确为 `0` 或空、且没有 `false_reason` 有效样本时使用；只要 Bamboo 或 Base 证明存在有效异常样本，就必须进入深度排查。

有有效样本的 `succeeded` 结果必须包含 `sample_checks`，至少点查一个异常对象，并记录 `object_type`、`object_id`、`tool` 以及 `current_state` / `snapshot_state` / `evidence` 之一；多个主要 `false_reason/status/error_code/object_type` 分组必须分别覆盖。`close-prepared-work-items` 会执行业务证据校验：有样本但缺 `sample_checks`、`sample_checks` schema 不完整、样本分组覆盖不足、缺规则证据或缺线上/日志/点查证据时，返回 `sample_checks_required_for_effective_samples`、`sample_checks_schema_invalid`、`sample_group_coverage_missing` 或 `business_evidence_categories_missing`，禁止写 Base、Bamboo 卡片和群消息。若声明 `evidence_count=0` 但 `evidence_items` 或 `sample_checks` 实际存在证据，会返回 `evidence_count_conflict`，必须统一证据计数。

运行失败不新增固定归因枚举：权限缺失归为 `[无效告警]表权限缺失`；Hive/TQS 对象不存在、字段不兼容、分区未就绪、SQL 语法/类型错误、资源超时等执行失败统一归为 `[无效告警]对账平台问题`，通过 `kind` / `error_class` / `evidence` 细分。`validate-model-result-json` 返回的 `diagnostics[]` 只用于机械修复或补证指引；若触发了审查返工，只能把 review `blockers[]` 和 `required_rework_prompt` 发回原排查子 agent，不要写入 `pending_review`、`needs_evidence` 等 Base 状态。最终 drain 未完成时必须依据 `run-summary.json.unfinished_records` 与 `blockers` 说明下一步。

RPC/API 权限不足只能作为能力边界，不能用于推导业务对象不存在、无记录或无需修数；这类推导会被 `rpc_permission_cannot_prove_object_missing` 拦截。深度排查正文如果只有空章节、模板占位或复制 Bamboo 明细而没有实际取证过程，会被 `doc_content_quality_gate_failed` 拦截。人工纠正后必须同步更新文档、Base、SOP、卡片和群消息，并标记旧结论已被替代。

规则 SOP 中已固化的 RPC 入参形状必须先通过 `validate-rpc-request` 校验。已收敛规则包括：`life.settle.ledger_center QueryLedgerByItemOrderId/QueryLedgerByShopOrderId` 必须使用复数字段 `ItemOrderIds` / `ShopOrderIds`，`life.settle.ledger_center MGetLedgerByLedgerId` 必须使用 `LedgerIds`，`life.settle.tax MGetTaxByTaxId` 必须使用 `TaxIds`，`life.settle.withdraw MGetTransferByTransferId` 必须使用 number 类型 `TransferIds` I64 数组。字段名或类型错误只能作为请求 schema 边界，不得作为业务对象不存在的证据。

回写 Base、Bamboo 卡片或群消息前必须校验 `ai_summary` 中写出的样本数与权威样本数一致；例如 `false_data_length=19` / `task_result_num=19` 时，摘要不能写 `异常样本数=0`，也不能归因为 `[无效告警]临界数据飘移` 或 `[无效告警]正常数据波动`。

runner 会在 normalized 结果中保留归因映射留痕字段：`raw_agent_attribution_result`、`runner_attribution_result`、`attribution_mapping_reason` 和 `investigation_evidence`。如果脚本因 `inspect_result.classification` 或 `qc_result` 修正了模型归因，最终汇总必须展示这些字段，不得只展示被修正后的枚举而丢失原始业务语义。

`close-prepared-work-items` 写 Base 前必须完成依赖预检：`command -v life-settle-ai-assistant`、`life-settle-ai-assistant list`、`command -v bamboo`、`bamboo --help`、`command -v bytedcli`。不要使用 `life-settle-ai-assistant --version` 作为可用性判断；该入口 CLI 的真实契约是列出/输出 skill 指引。预检失败必须返回 `dependency_preflight_failed`，Base、Bamboo 卡片和群消息都不得写回。不要在每轮强制全局安装 latest；只有预检明确缺失或不可用时，才安装/同步并重新预检。

Bamboo 卡片回写必须保留独立终态。具备正整数 `alarm_record_detail_id` 时，runner 最多执行 3 次卡片 attempt，并记录 `card_update_attempts`、`card_update_failure_class` 和失败原因；分类固定为 `bamboo_not_found`、`life_alarm_timeout`、`fetch_failed`、`auth_failed`、`unknown`。`card_update_status=failed` 或 `message_reply_status=failed` 时，Base 业务终态不回滚，但 `close-prepared-work-items` 顶层必须 `success=false` / `partial_failed=true`，并拆分返回 `business_close` 与 `notification_close`。最终汇总必须明确 `business_close.success` 和 `notification_close.success`，不得把通知层失败描述成完整闭环。

`recover-processing-records` 的 inventory 必须按 `records` / `processingRecords` / `processing_records` 三个同值 key 读取；跨会话残留 processing 只能在精确指定 `--result-id` 且传 `--force-by-result-id --apply` 时强制恢复，缺少任一门禁会返回 `reason_code=FORCE_REQUIRES_RESULT_ID_APPLY`。close 失败时优先读取 `reason_code`、`required_fields_missing`、`fix_commands` 和 `doc_inspect`，不要只按长文本 reason 猜 runner 内部字段。

发现某条记录因样本数、QC 快速闭环或运行失败口径误判后，必须对同批次结果目录执行只读复核：

```bash
node scripts/bamboo/bamboo-alert-runner.mjs validate-result-dir \
  --work-items-file ".tmp/<WORK_ITEMS>.json" \
  --result-dir ".tmp/<MODEL_RESULT_DIR>"
```

该命令只运行 validator，不写 Base、不更新卡片、不回复消息。若返回 `success=false`，必须按 `hard_fail_code_counts` 修正同批次所有问题记录后，才能执行 `close-prepared-work-items`。

`not_support` 也必须写清楚能力边界和样本数口径，例如 `rule_type=multi_sources`、权威样本数及来源；不能只写“当前不支持自动排查”。

## 重要边界

除 `bamboo groups-scan-and-troubleshoot` 这个 Bamboo 受控 CLI 指令外，`life-settle-ai-assistant` CLI 只输出 skill 指引，不是业务执行 CLI。`groups-scan-and-troubleshoot` 只做 preflight、dry-run 计划和 runner 状态机入口，不集成 LLM/agent SDK；单条排障与审查仍必须由主会话按 `dispatch_plan` 派发 fresh context 子 agent。

不要执行以下行为：

- 不要臆造未列出的 skill 名称。
- 不要把该 CLI 当作 Bamboo、RPC、Feishu 或 PSM 的直接执行入口；仅允许 `life-settle-ai-assistant bamboo groups-scan-and-troubleshoot` 执行受控闭环编排入口。`alerts-to-base`、`scan-chat-to-csv`、`parse-chat-csv-to-bamboo-alert-csv` 和 `upsert-bamboo-alert-csv-to-daily-base` 只是 runner 内部阶段，不作为外部 CLI 子命令暴露。
- `prepare-single-troubleshoot-data`、`write-local-troubleshooting-result`、`close-single-troubleshoot-from-local` 和 `claim-next-work-item-from-daily-base-csv` 是仓库 runner 内部编排入口，只能通过 `node scripts/bamboo/bamboo-alert-runner.mjs ...` 在本仓库工作区使用；不要把它们包装成 `life-settle-ai-assistant` 对外子命令。
- 不要直接调用 Feishu OpenAPI。
- 不要新增本地 Feishu wrapper、SDK client 或 token 交换逻辑。
- 不要要求用户在聊天中粘贴飞书密钥。
- 不要跳过 CLI 输出中的 `Shared project context`；云端执行时不能假设已经读取了本地 `AGENTS.md` 或项目 memory。

如果 bot 身份操作缺少凭证，只说明需要用户在本地设置：

```bash
export FEISHU_BOT_APP_ID="cli_xxx"
export FEISHU_BOT_APP_SECRET="secret_xxx"
```

然后停止。
