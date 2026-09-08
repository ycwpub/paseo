import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type {
  AlertTroubleshooterRecordExecutionInput,
  AlertTroubleshooterRecordExecutionResult,
} from "./alert-troubleshooter-agent-execution.js";
import {
  bambooAgentArtifactPaths,
  buildBambooLocalValidation,
  ensureBambooAgentArtifactDirectories,
  existingBambooArtifact,
  readBambooInvestigationResult,
  readBambooReviewResult,
  readBambooSopSummaryResult,
  readRequiredBambooMarkdown,
  writeBambooAgentJsonAtomic,
  type BambooAgentArtifactPaths,
  type BambooInvestigationResult,
  type BambooSopSummaryResult,
} from "./bamboo-agent-artifact-store.js";
import {
  buildBambooRunSummary,
  closeBambooReadyWorkItem,
  prepareBambooAgentData,
  publishBambooSopSummary,
  renderBambooRunReport,
  validateBambooModelResult,
  validateBambooResultDirectory,
  type BambooCloseReadyResult,
  type BambooModelValidation,
  type BambooPreparedAgentData,
  type BambooResultDirectoryValidation,
  type BambooRunReport,
  type BambooRunSummary,
  type BambooSopPublication,
} from "./bamboo-agent-runner.js";
import {
  publishBambooTroubleshooterDocument,
  type BambooTroubleshooterDocumentPublication,
} from "./bamboo-troubleshooter-document-publisher.js";

const STAGE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["completed"] },
    artifacts: { type: "array", items: { type: "string" } },
  },
  required: ["status", "artifacts"],
  additionalProperties: false,
};

export interface BambooAgentOrchestratorDependencies {
  prepareAgentData(input: {
    config: AlertTroubleshooterConfig;
    record: AlertTroubleshooterRecordExecutionInput["record"];
    workspaceCwd: string;
    outputDirectory: string;
    auditFile: string;
  }): Promise<BambooPreparedAgentData>;
  publishDocument(input: {
    config: AlertTroubleshooterConfig;
    record: AlertTroubleshooterRecordExecutionInput["record"];
    workspaceCwd: string;
    wikiTarget: { spaceId: string; parentNodeToken: string };
    markdownFile?: string;
    auditFile?: string;
  }): Promise<BambooTroubleshooterDocumentPublication>;
  publishSop(input: {
    config: AlertTroubleshooterConfig;
    record: AlertTroubleshooterRecordExecutionInput["record"];
    workspaceCwd: string;
    ruleId: string;
    markdownFile: string;
    auditFile: string;
  }): Promise<BambooSopPublication>;
  validateModelResult(input: {
    workspaceCwd: string;
    resultFile: string;
    workItemFile: string;
    markdownFile: string;
    auditFile: string;
  }): Promise<BambooModelValidation>;
  validateResultDirectory(input: {
    workspaceCwd: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
  }): Promise<BambooResultDirectoryValidation>;
  closeReadyWorkItem(input: {
    workspaceCwd: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
  }): Promise<BambooCloseReadyResult>;
  buildRunSummary(input: {
    workspaceCwd: string;
    scanDirectoryUrl: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
  }): Promise<BambooRunSummary>;
  renderRunReport(input: {
    workspaceCwd: string;
    resultDirectory: string;
    runSummaryFile: string;
    auditFile: string;
  }): Promise<BambooRunReport>;
}

export type BambooAgentOrchestrator = (
  input: AlertTroubleshooterRecordExecutionInput,
  dependencies?: BambooAgentOrchestratorDependencies,
) => Promise<AlertTroubleshooterRecordExecutionResult>;

export const defaultBambooAgentOrchestratorDependencies: BambooAgentOrchestratorDependencies = {
  prepareAgentData: prepareBambooAgentData,
  publishDocument: publishBambooTroubleshooterDocument,
  publishSop: publishBambooSopSummary,
  validateModelResult: validateBambooModelResult,
  validateResultDirectory: validateBambooResultDirectory,
  closeReadyWorkItem: closeBambooReadyWorkItem,
  buildRunSummary: buildBambooRunSummary,
  renderRunReport: renderBambooRunReport,
};

function investigationPrompt(input: {
  runInput: string;
  preparedAudit: string;
  investigationInput: string;
  resultFile: string;
  reportFile: string;
  ruleSopDraft: string;
}): string {
  return [
    "你是 Bamboo 单条报警排查 Agent。你拥有独立上下文，不得依赖其它 Agent 的聊天记录。",
    "先运行 `life-settle-ai-assistant bamboo guide alert-troubleshooter`，遵循其中的 Shared project context、归因枚举、证据和样本点查要求。",
    `代码生成的任务输入：${input.runInput}`,
    `代码准备的排查数据：${input.preparedAudit}`,
    `本阶段输入清单：${input.investigationInput}`,
    "只读取上述本地文件和完成排查所需的只读证据。不得扫描或认领其它记录，不得更新 Base、飞书文档、Bamboo 卡片或群消息。",
    `先把完整结果 JSON 写入 ${input.resultFile}.tmp，再原子重命名为 ${input.resultFile}。`,
    'JSON 必须满足 Runner 模型结果契约：version=1、result_id、status、summary/ai_summary、固定 attribution_result、confidence、sample_count_authority、sample_checks、evidence_items、writeback_owner="parent_orchestrator"。有有效样本时必须包含真实点查证据；不得留下 TBD/TODO/请填写等占位内容。',
    "status=succeeded 时设置 success=true；等待授权时设置 status=pending、waiting_for_user_authorization=true 和结构化 pending_admission。不得用权限不足推导业务对象不存在。",
    `把完整排查报告先写入 ${input.reportFile}.tmp，再原子重命名为 ${input.reportFile}。`,
    `把本规则可复用 SOP 草稿先写入 ${input.ruleSopDraft}.tmp，再原子重命名为 ${input.ruleSopDraft}。没有可沉淀内容时也要写明原因。`,
    "最终回复只确认本地文件已经完成，不要在回复中传递排查正文。",
  ].join("\n\n");
}

function sopSummaryPrompt(input: {
  preparedAudit: string;
  investigationResult: string;
  investigationReport: string;
  ruleSopDraft: string;
  summaryInput: string;
  summaryResult: string;
  summaryMarkdown: string;
}): string {
  return [
    "你是 Bamboo SOP 文档汇总 Agent。你拥有独立上下文，只能通过本地文件接收上游结果。",
    "先运行 `life-settle-ai-assistant bamboo guide alert-troubleshooter`，仅提炼本条规则可复用、已被证据验证的步骤。",
    `代码准备的数据：${input.preparedAudit}`,
    `排查结果：${input.investigationResult}`,
    `排查报告：${input.investigationReport}`,
    `规则 SOP 草稿：${input.ruleSopDraft}`,
    `本阶段输入清单：${input.summaryInput}`,
    "汇总可复用的规则排查步骤；不要执行飞书文档发布、Base 回写、卡片更新、群消息回复或任何其它写副作用。",
    `先把结果 JSON 写入 ${input.summaryResult}.tmp，再原子重命名为 ${input.summaryResult}。`,
    'JSON 必须包含 version=1、result_id、status="ready|skipped"、summary，可发布时必须包含 rule_id。',
    `先把最终 SOP Markdown 写入 ${input.summaryMarkdown}.tmp，再原子重命名为 ${input.summaryMarkdown}。`,
    "最终回复只确认本地文件已经完成，不要在回复中传递 SOP 正文。",
  ].join("\n\n");
}

function reviewPrompt(input: {
  reviewInput: string;
  reviewResult: string;
  checkedFiles: readonly string[];
}): string {
  return [
    "你是 Bamboo 排查审核 Agent。你拥有独立 fresh context，只进行只读审核。",
    "先运行 `life-settle-ai-assistant guide bamboo-alert-groups-scan-and-troubleshoot`，严格执行最终发布审计和 close 门禁。",
    `审核输入清单：${input.reviewInput}`,
    `必须逐一检查：${input.checkedFiles.join("、")}`,
    "不得修改排查结果、不得执行飞书/Base/Bamboo/群消息写入、不得关闭任务。",
    "必须核对最终 result JSON、最终发布 audit 的 mergedMarkdown、SOP audit 和 Runner validator 输出；任一缺失、validator 未通过、发布正文仍含占位内容时必须 review_passed=false。",
    `先把审核 JSON 写入 ${input.reviewResult}.tmp，再原子重命名为 ${input.reviewResult}。`,
    "JSON 必须包含 review_passed、blockers[]、required_rework_prompt、checked_files[]、validation_command、review_summary。",
    "审核不通过时，required_rework_prompt 必须给出可直接交回排查 Agent 的明确返工要求。",
    "最终回复只确认审核文件已经完成，不要在回复中传递审核正文。",
  ].join("\n\n");
}

function buildRunnerWorkItem(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  prepared: BambooPreparedAgentData;
  resultId: string;
}): Record<string, unknown> {
  const closeContext = input.execution.closeContext;
  if (!closeContext) {
    throw new Error("无法解析 Bamboo 日报 Base 的关闭上下文，不能执行受控 close");
  }
  const record = input.execution.record;
  const extra = {
    ...record.extra,
    ...(record.messageId ? { message_id: record.messageId } : {}),
    ...(record.chatId ? { chat_id: record.chatId, group_id: record.chatId } : {}),
    ...(record.chatName ? { chat_name: record.chatName } : {}),
    trigger: record.trigger,
  };
  return {
    ...input.prepared.work_item,
    result_id: input.resultId,
    record_id: record.recordId,
    base_token: closeContext.baseToken,
    table_id: closeContext.tableId,
    parent_wiki_token: closeContext.parentWikiToken,
    target_space_id: closeContext.targetSpaceId,
    task_name: record.taskName ?? `Bamboo result_id ${input.resultId}`,
    task_date: record.tableDate,
    task_time: record.taskTime ?? record.messageTime ?? "",
    rule_id: record.ruleId ?? input.prepared.rule_id ?? "",
    expected_rule_id: record.ruleId ?? input.prepared.rule_id ?? "",
    bamboo_url: record.bambooUrl ?? "",
    alarm_record_detail_id: record.alarmRecordDetailId ?? "",
    task_id: record.taskId ?? "",
    troubleshooting_sop_doc: input.execution.config.troubleshootingSopDoc,
    extra,
    source: "paseo-bamboo-agent-orchestrator",
  };
}

async function preparePipelineArtifacts(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: BambooAgentOrchestratorDependencies;
  paths: BambooAgentArtifactPaths;
  resultId: string;
}): Promise<BambooPreparedAgentData> {
  const previousReviewResult = await existingBambooArtifact(input.paths.previousReviewResult);
  await ensureBambooAgentArtifactDirectories(input.paths);
  await writeBambooAgentJsonAtomic(input.paths.runInput, {
    version: 1,
    result_id: input.resultId,
    queue_item_id: input.execution.item.id,
    attempt: input.execution.item.attempts,
    trigger: input.execution.item.trigger,
    record: input.execution.record,
    wiki_target: input.execution.wikiTarget ?? null,
    processing_instructions: input.execution.prompt,
    previous_review_result: previousReviewResult,
    writeback_owner: "parent_orchestrator",
  });
  const prepared = await input.dependencies.prepareAgentData({
    config: input.execution.config,
    record: input.execution.record,
    workspaceCwd: input.execution.workspace.cwd,
    outputDirectory: input.paths.preparedDirectory,
    auditFile: input.paths.preparedAudit,
  });
  const workItem = buildRunnerWorkItem({
    execution: input.execution,
    prepared,
    resultId: input.resultId,
  });
  await Promise.all([
    writeBambooAgentJsonAtomic(input.paths.workItem, workItem),
    writeBambooAgentJsonAtomic(input.paths.workItems, [workItem]),
    writeBambooAgentJsonAtomic(input.paths.resultWorkItems, [workItem]),
  ]);
  await writeBambooAgentJsonAtomic(input.paths.investigationInput, {
    version: 1,
    run_input: input.paths.runInput,
    prepared_audit: input.paths.preparedAudit,
    prepared_data_path: prepared.prepared_data_path ?? null,
    total_sop_local_path: prepared.total_sop_local_path ?? null,
    rule_sop_local_path: prepared.rule_sop_local_path ?? null,
    work_item: input.paths.workItem,
    output_files: {
      result: input.paths.investigationResult,
      report: input.paths.investigationReport,
      rule_sop_draft: input.paths.ruleSopDraft,
    },
  });
  return prepared;
}

async function runInvestigationStage(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: BambooAgentArtifactPaths;
  resultId: string;
}): Promise<{
  agentId: string;
  result: BambooInvestigationResult;
  reportMarkdown: string;
}> {
  const agent = await input.execution.launchAgent({
    stage: "investigation",
    title: `Bamboo 排查 · ${input.resultId}`,
    prompt: investigationPrompt({
      runInput: input.paths.runInput,
      preparedAudit: input.paths.preparedAudit,
      investigationInput: input.paths.investigationInput,
      resultFile: input.paths.investigationResult,
      reportFile: input.paths.investigationReport,
      ruleSopDraft: input.paths.ruleSopDraft,
    }),
    outputSchema: STAGE_OUTPUT_SCHEMA,
    labels: { bambooAgentRole: "investigation", bambooResultId: input.resultId },
  });
  const result = await readBambooInvestigationResult(input.paths.investigationResult);
  const reportMarkdown = await readRequiredBambooMarkdown(
    input.paths.investigationReport,
    "排查报告",
  );
  await readRequiredBambooMarkdown(input.paths.ruleSopDraft, "规则 SOP 草稿");
  return { agentId: agent.agentId, result, reportMarkdown };
}

async function runSopSummaryStage(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: BambooAgentArtifactPaths;
  resultId: string;
  prepared: BambooPreparedAgentData;
}): Promise<{ result: BambooSopSummaryResult; markdown: string }> {
  await writeBambooAgentJsonAtomic(input.paths.sopSummaryInput, {
    version: 1,
    result_id: input.resultId,
    prepared_audit: input.paths.preparedAudit,
    investigation_result: input.paths.investigationResult,
    investigation_report: input.paths.investigationReport,
    rule_sop_draft: input.paths.ruleSopDraft,
    current_total_sop: input.prepared.total_sop_local_path ?? null,
    current_rule_sop: input.prepared.rule_sop_local_path ?? null,
    output_files: {
      result: input.paths.sopSummaryResult,
      markdown: input.paths.sopSummaryMarkdown,
    },
  });
  await input.execution.launchAgent({
    stage: "sop_summary",
    title: `Bamboo SOP 汇总 · ${input.resultId}`,
    prompt: sopSummaryPrompt({
      preparedAudit: input.paths.preparedAudit,
      investigationResult: input.paths.investigationResult,
      investigationReport: input.paths.investigationReport,
      ruleSopDraft: input.paths.ruleSopDraft,
      summaryInput: input.paths.sopSummaryInput,
      summaryResult: input.paths.sopSummaryResult,
      summaryMarkdown: input.paths.sopSummaryMarkdown,
    }),
    outputSchema: STAGE_OUTPUT_SCHEMA,
    labels: { bambooAgentRole: "sop_summary", bambooResultId: input.resultId },
  });
  return {
    result: await readBambooSopSummaryResult(input.paths.sopSummaryResult),
    markdown: await readRequiredBambooMarkdown(input.paths.sopSummaryMarkdown, "SOP 汇总文档"),
  };
}

interface BambooPublishedArtifacts {
  document: BambooTroubleshooterDocumentPublication;
  sop: BambooSopPublication;
}

function assertLocalArtifacts(input: {
  resultId: string;
  investigation: BambooInvestigationResult;
  reportMarkdown: string;
  sopSummary: BambooSopSummaryResult;
  sopMarkdown: string;
}): void {
  const validation = buildBambooLocalValidation(input);
  if (!validation.valid) {
    throw new Error(`Bamboo 本地产物校验失败：${validation.blockers.join("；")}`);
  }
}

async function publishAgentArtifacts(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: BambooAgentOrchestratorDependencies;
  paths: BambooAgentArtifactPaths;
  investigation: BambooInvestigationResult;
  sopSummary: BambooSopSummaryResult;
  prepared: BambooPreparedAgentData;
}): Promise<BambooPublishedArtifacts> {
  if (!input.execution.wikiTarget) {
    throw new Error("无法解析当前日报 Base 的 Wiki 节点，不能归档排查文档");
  }
  const document = await input.dependencies.publishDocument({
    config: input.execution.config,
    record: input.execution.record,
    workspaceCwd: input.execution.workspace.cwd,
    wikiTarget: input.execution.wikiTarget,
    markdownFile: input.paths.investigationReport,
    auditFile: input.paths.publishDocumentAudit,
  });
  let sop: BambooSopPublication;
  if (input.sopSummary.status === "ready") {
    const ruleId =
      input.sopSummary.rule_id?.trim() ||
      input.investigation.rule_id?.trim() ||
      input.prepared.rule_id;
    if (!ruleId) throw new Error("SOP 汇总结果为 ready，但缺少 rule_id");
    sop = await input.dependencies.publishSop({
      config: input.execution.config,
      record: input.execution.record,
      workspaceCwd: input.execution.workspace.cwd,
      ruleId,
      markdownFile: input.paths.sopSummaryMarkdown,
      auditFile: input.paths.publishSopAudit,
    });
  } else {
    sop = {
      success: true,
      sop_writeback_status: "skipped",
      sop_writeback_reason: input.sopSummary.summary,
    };
    await writeBambooAgentJsonAtomic(input.paths.publishSopAudit, sop);
  }
  if (!sop.success || sop.sop_writeback_status === "failed") {
    throw new Error(`Bamboo SOP 发布失败：${sop.sop_writeback_reason ?? "runner 未返回成功终态"}`);
  }
  return { document, sop };
}

async function writeFinalModelResult(input: {
  paths: BambooAgentArtifactPaths;
  investigation: BambooInvestigationResult;
  publication: BambooPublishedArtifacts;
}): Promise<void> {
  const status = input.investigation.status;
  if (status === "not_support") {
    throw new Error("非离线 Hive 规则应在认领阶段标记 not_support，不应启动排查 Agent");
  }
  await writeBambooAgentJsonAtomic(input.paths.investigationResult, {
    ...input.investigation,
    success: status === "succeeded",
    status,
    summary: input.investigation.summary,
    ai_summary: input.investigation.summary,
    feishu_doc_url: input.publication.document.documentUrl,
    doc_url: input.publication.document.documentUrl,
    ai_result: input.publication.document.documentUrl,
    ...(input.publication.document.documentToken
      ? { doc_token: input.publication.document.documentToken }
      : {}),
    doc_write_status: input.publication.document.writeStatus ?? "updated",
    doc_archive_status: "succeeded",
    doc_archive_reason:
      input.publication.document.archiveReason ?? "已由受控 runner 归档到当前日报 Base Wiki 节点",
    sop_writeback_status: input.publication.sop.sop_writeback_status,
    sop_writeback_reason:
      input.publication.sop.sop_writeback_reason ??
      (input.publication.sop.sop_writeback_status === "succeeded"
        ? "规则 SOP 已由受控 runner 写回"
        : "本次没有可复用 SOP 更新"),
    ...(input.publication.sop.sop_doc_url
      ? {
          sop_doc_url: input.publication.sop.sop_doc_url,
          sop_doc_archive_status: "succeeded",
        }
      : {}),
    writeback_owner: "parent_orchestrator",
  });
}

function modelValidationPassed(validation: BambooModelValidation): boolean {
  return validation.overallValid === true || validation.overall_valid === true;
}

async function runReviewGate(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: BambooAgentArtifactPaths;
  resultId: string;
  validation: BambooModelValidation;
}): Promise<void> {
  const checkedFiles = [
    input.paths.workItem,
    input.paths.investigationResult,
    input.paths.investigationReport,
    input.paths.publishDocumentAudit,
    input.paths.publishSopAudit,
    input.paths.modelValidationAudit,
  ];
  await writeBambooAgentJsonAtomic(input.paths.reviewInput, {
    version: 1,
    result_id: input.resultId,
    checked_files: checkedFiles,
    output_file: input.paths.reviewResult,
  });
  await input.execution.launchAgent({
    stage: "review",
    title: `Bamboo 审核 · ${input.resultId}`,
    prompt: reviewPrompt({
      reviewInput: input.paths.reviewInput,
      reviewResult: input.paths.reviewResult,
      checkedFiles,
    }),
    outputSchema: STAGE_OUTPUT_SCHEMA,
    labels: { bambooAgentRole: "review", bambooResultId: input.resultId },
  });
  const review = await readBambooReviewResult(input.paths.reviewResult);
  const uncheckedFiles = checkedFiles.filter((file) => !review.checked_files.includes(file));
  const blockers = [
    ...(modelValidationPassed(input.validation)
      ? []
      : [
          input.validation.hardFailCode ??
            input.validation.hard_fail_code ??
            "runner_model_validation_failed",
        ]),
    ...review.blockers,
    ...uncheckedFiles.map((file) => `review_did_not_check:${file}`),
  ];
  if (review.review_passed && blockers.length === 0) return;
  const rework = review.required_rework_prompt.trim();
  throw new Error(
    `Bamboo 排查审核未通过：${blockers.join("；") || review.review_summary}${
      rework ? `。返工要求：${rework}` : ""
    }`,
  );
}

function closeWarning(close: BambooCloseReadyResult): string | undefined {
  const notificationFailures = close.close_results.filter(
    (result) => result.notification_close.success === false,
  );
  if (notificationFailures.length === 0) return undefined;
  return `业务排查已关闭，但通知回写部分失败：${JSON.stringify(
    notificationFailures.map((result) => result.notification_close),
  )}`;
}

async function runFinalDrain(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: BambooAgentOrchestratorDependencies;
  paths: BambooAgentArtifactPaths;
}): Promise<string | undefined> {
  try {
    const summary = await input.dependencies.buildRunSummary({
      workspaceCwd: input.execution.workspace.cwd,
      scanDirectoryUrl: input.execution.config.attributionRecordRoot,
      resultDirectory: input.paths.runDirectory,
      workItemsFile: input.paths.workItems,
      auditFile: input.paths.runSummary,
    });
    const report = await input.dependencies.renderRunReport({
      workspaceCwd: input.execution.workspace.cwd,
      resultDirectory: input.paths.runDirectory,
      runSummaryFile: input.paths.runSummary,
      auditFile: input.paths.runReport,
    });
    const ready =
      summary.ready_to_report_complete === true &&
      summary.final_drain?.ready_to_report_complete === true &&
      report.ready_to_report_complete;
    return ready ? undefined : `最终 drain 尚未清零：${report.ready_to_report_complete_reason}`;
  } catch (error) {
    return `业务排查已关闭，但最终 drain/report 生成失败：${
      error instanceof Error ? error.message : String(error)
    }`;
  }
}

export async function executeBambooAgentPipeline(
  input: AlertTroubleshooterRecordExecutionInput,
  dependencies: BambooAgentOrchestratorDependencies = defaultBambooAgentOrchestratorDependencies,
): Promise<AlertTroubleshooterRecordExecutionResult> {
  const resultId = input.record.resultId?.trim();
  if (!resultId) throw new Error("Bamboo 排查记录缺少 result_id");
  const paths = bambooAgentArtifactPaths({
    workspaceCwd: input.workspace.cwd,
    resultId,
    queueItemId: input.item.id,
    attempt: input.item.attempts,
  });
  const prepared = await preparePipelineArtifacts({
    execution: input,
    dependencies,
    paths,
    resultId,
  });
  const investigation = await runInvestigationStage({ execution: input, paths, resultId });
  const sopSummary = await runSopSummaryStage({
    execution: input,
    paths,
    resultId,
    prepared,
  });
  assertLocalArtifacts({
    resultId,
    investigation: investigation.result,
    reportMarkdown: investigation.reportMarkdown,
    sopSummary: sopSummary.result,
    sopMarkdown: sopSummary.markdown,
  });
  const publication = await publishAgentArtifacts({
    execution: input,
    dependencies,
    paths,
    investigation: investigation.result,
    sopSummary: sopSummary.result,
    prepared,
  });
  await writeFinalModelResult({
    paths,
    investigation: investigation.result,
    publication,
  });
  const modelValidation = await dependencies.validateModelResult({
    workspaceCwd: input.workspace.cwd,
    resultFile: paths.investigationResult,
    workItemFile: paths.workItem,
    markdownFile: paths.investigationReport,
    auditFile: paths.modelValidationAudit,
  });
  await runReviewGate({
    execution: input,
    paths,
    resultId,
    validation: modelValidation,
  });
  const directoryValidation = await dependencies.validateResultDirectory({
    workspaceCwd: input.workspace.cwd,
    resultDirectory: paths.runDirectory,
    workItemsFile: paths.workItems,
    auditFile: paths.resultDirectoryValidationAudit,
  });
  const readiness = directoryValidation.per_result_close_readiness.find(
    (item) => item.result_id === resultId,
  );
  if (
    !directoryValidation.success ||
    directoryValidation.close_ready !== 1 ||
    !readiness?.ready_for_close
  ) {
    throw new Error(
      `Bamboo 结果目录未通过 close 门禁：${
        readiness?.blockers.join("；") || "runner validate-result-dir 返回未就绪"
      }`,
    );
  }
  const close = await dependencies.closeReadyWorkItem({
    workspaceCwd: input.workspace.cwd,
    resultDirectory: paths.runDirectory,
    workItemsFile: paths.workItems,
    auditFile: paths.closeReadyAudit,
  });
  const businessCloseSucceeded =
    close.ready_count === 1 &&
    close.skipped_count === 0 &&
    close.close_results.length === 1 &&
    close.close_results[0]?.business_close.success === true;
  if (!businessCloseSucceeded) {
    throw new Error(`Bamboo runner close 未完成业务闭环：${JSON.stringify(close)}`);
  }
  const warnings = [
    closeWarning(close),
    await runFinalDrain({ execution: input, dependencies, paths }),
  ]
    .filter((warning): warning is string => Boolean(warning))
    .join("；");

  return {
    agentId: investigation.agentId,
    completion: {
      status: investigation.result.status,
      summary: investigation.result.summary,
      documentUrl: publication.document.documentUrl,
    },
    persistenceHandled: true,
    ...(warnings ? { completionWarning: warnings } : {}),
  };
}
