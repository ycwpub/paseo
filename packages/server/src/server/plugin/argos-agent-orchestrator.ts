import { readFile } from "node:fs/promises";
import path from "node:path";
import type {
  AlertTroubleshooterRecordExecutionInput,
  AlertTroubleshooterRecordExecutionResult,
} from "./alert-troubleshooter-agent-execution.js";
import { ARGOS_ATTRIBUTION_FIELD_NAMES } from "./argos-alert-record.js";
import {
  argosAgentArtifactPaths,
  clearArgosReviewResult,
  ensureArgosArtifactDirectories,
  readArgosInvestigationResult,
  readArgosMarkdown,
  readArgosSopSummaryResult,
  writeArgosJsonAtomic,
  type ArgosAgentArtifactPaths,
  type ArgosInvestigationResult,
} from "./argos-agent-artifact-store.js";
import {
  buildArgosRunSummary,
  closeArgosReadyWorkItem,
  prepareArgosAgentData,
  publishArgosDocument,
  publishArgosSop,
  renderArgosRunReport,
  validateArgosResultDirectory,
  type ArgosCloseReadyResult,
  type ArgosDocumentPublication,
  type ArgosPreparedAgentData,
  type ArgosResultDirectoryValidation,
  type ArgosSopPublication,
} from "./argos-agent-runner.js";
import {
  buildArgosInvestigationReworkPrompt,
  reviewArgosAgentArtifacts,
} from "./argos-agent-review-gate.js";
import { buildArgosTaskRunReport } from "./argos-run-report.js";
import { AlertTroubleshooterPendingError } from "./alert-troubleshooter-failure-policy.js";

const MAX_REVIEW_REWORKS = 2;
const STAGE_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["completed"] },
    artifacts: { type: "array", items: { type: "string" } },
  },
  required: ["status", "artifacts"],
  additionalProperties: false,
};

export interface ArgosAgentOrchestratorDependencies {
  prepareAgentData: typeof prepareArgosAgentData;
  publishDocument: typeof publishArgosDocument;
  publishSop: typeof publishArgosSop;
  validateResultDirectory: typeof validateArgosResultDirectory;
  closeReadyWorkItem: typeof closeArgosReadyWorkItem;
  buildRunSummary: typeof buildArgosRunSummary;
  renderRunReport: typeof renderArgosRunReport;
}

export type ArgosAgentOrchestrator = (
  input: AlertTroubleshooterRecordExecutionInput,
  dependencies?: ArgosAgentOrchestratorDependencies,
) => Promise<AlertTroubleshooterRecordExecutionResult>;

export const defaultArgosAgentOrchestratorDependencies: ArgosAgentOrchestratorDependencies = {
  prepareAgentData: prepareArgosAgentData,
  publishDocument: publishArgosDocument,
  publishSop: publishArgosSop,
  validateResultDirectory: validateArgosResultDirectory,
  closeReadyWorkItem: closeArgosReadyWorkItem,
  buildRunSummary: buildArgosRunSummary,
  renderRunReport: renderArgosRunReport,
};

function stringExtra(
  record: AlertTroubleshooterRecordExecutionInput["record"],
  key: string,
): string {
  const value = record.extra?.[key];
  return typeof value === "string" ? value.trim() : "";
}

function buildWorkItem(
  execution: AlertTroubleshooterRecordExecutionInput,
  resultId: string,
): Record<string, unknown> {
  if (!execution.closeContext) {
    throw new Error("无法解析 Argos 日报 Base 的关闭上下文，不能执行受控排查");
  }
  const ruleId = execution.record.ruleId?.trim() || execution.record.uniqueId.trim();
  return {
    record_id: execution.record.recordId,
    unique_id: ruleId,
    result_id: resultId,
    rule_id: ruleId,
    rule_name: execution.record.taskName?.trim() || stringExtra(execution.record, "rule_name"),
    psm: stringExtra(execution.record, "psm"),
    level: stringExtra(execution.record, "level"),
    result_time: execution.record.taskTime?.trim() || execution.record.messageTime?.trim() || "",
    result_url: stringExtra(execution.record, "result_url"),
    rule_url: stringExtra(execution.record, "rule_url"),
    rule_content: stringExtra(execution.record, "rule_content"),
    result_content: stringExtra(execution.record, "result_content") || execution.record.messageText,
    status: "processing",
    date_key: execution.record.tableDate,
    ai_session_id: `${execution.state.pluginId}:${execution.state.projectId ?? ""}`,
    base_token: execution.closeContext.baseToken,
    table_id: execution.closeContext.tableId,
    parent_wiki_token: execution.closeContext.parentWikiToken,
    target_space_id: execution.closeContext.targetSpaceId,
    field_names: ARGOS_ATTRIBUTION_FIELD_NAMES,
    troubleshooting_sop_doc: execution.config.troubleshootingSopDoc,
    message_id: execution.record.messageId ?? "",
    extra: {
      ...execution.record.extra,
      message_id: execution.record.messageId ?? "",
      chat_id: execution.record.chatId ?? "",
      group_id: execution.record.chatId ?? "",
      chat_name: execution.record.chatName ?? "",
      trigger: execution.record.trigger,
    },
    source: "paseo-argos-agent-orchestrator",
  };
}

function investigationPrompt(input: {
  paths: ArgosAgentArtifactPaths;
  resultId: string;
  execution: AlertTroubleshooterRecordExecutionInput;
}): string {
  return [
    "你是 Argos 单条报警排查 Agent。你拥有独立上下文，不得依赖其它 Agent 的聊天记录。",
    "先运行 `life-settle-ai-assistant argos_alarm guide alert-troubleshooter`，严格遵循 Shared project context、固定归因枚举和证据要求。",
    `任务运行输入：${input.paths.runInput}`,
    `Runner 准备结果：${input.paths.preparedAudit}`,
    `Runner 单条输入包：${input.paths.preparedDirectory}/single-input-${input.resultId}.json`,
    `本阶段输入清单：${input.paths.investigationInput}`,
    input.execution.config.troubleshootingSkills.length > 0
      ? `按需使用增强 Skill：${input.execution.config.troubleshootingSkills.join("、")}`
      : "未配置额外增强 Skill。",
    input.execution.config.referenceFeishuDocs.length > 0
      ? `补充参考飞书文档：${input.execution.config.referenceFeishuDocs.join("、")}`
      : "未配置额外参考飞书文档。",
    "历史同规则结论只作为待验证假设和取证路径，本次必须重新核对报警窗口内的指标、日志、trace、变更、代码或依赖证据。",
    "不得扫描或认领其它记录，不得更新 Base、飞书文档、SOP、卡片或群消息。",
    `结果 JSON 先写 ${input.paths.investigationResult}.tmp，再原子重命名为 ${input.paths.investigationResult}。`,
    'JSON 必须包含 version=1、result_id、status、summary、固定 attribution_result、rule_id、rule_name、confidence、evidence_items[]、writeback_owner="parent_orchestrator"。',
    "每条 evidence_items 必须有 category/source 和可复核摘要；succeeded 至少包含 argos_rca|metric 之一及第二类佐证证据。",
    `排查报告先写 ${input.paths.investigationReport}.tmp，再原子重命名为 ${input.paths.investigationReport}。`,
    "报告必须包含：现象与影响范围、时间线、已验证证据、历史结论复核、根因或候选假设、处置建议、后续行动。",
    `规则 SOP 草稿先写 ${input.paths.ruleSopDraft}.tmp，再原子重命名为 ${input.paths.ruleSopDraft}。`,
    "最终回复只确认本地产物完成。",
  ].join("\n\n");
}

function sopSummaryPrompt(input: { paths: ArgosAgentArtifactPaths; resultId: string }): string {
  return [
    "你是 Argos SOP 汇总 Agent。你拥有独立上下文，只能通过本地文件接收上游结果。",
    `Runner 准备结果：${input.paths.preparedAudit}`,
    `排查结果：${input.paths.investigationResult}`,
    `排查报告：${input.paths.investigationReport}`,
    `规则 SOP 草稿：${input.paths.ruleSopDraft}`,
    `本阶段输入清单：${input.paths.sopSummaryInput}`,
    "总 SOP 只保留 Argos 通用取证顺序、判断口径和注意事项；规则 SOP 只保留该 rule_id 的稳定指标、日志、依赖和反例，不得写入本次 result_id 或一次性处置结论。",
    `结果 JSON 先写 ${input.paths.sopSummaryResult}.tmp，再原子重命名为 ${input.paths.sopSummaryResult}。`,
    `通用 SOP 先写 ${input.paths.totalSopMarkdown}.tmp，再原子重命名为 ${input.paths.totalSopMarkdown}。`,
    `规则 SOP 先写 ${input.paths.ruleSopMarkdown}.tmp，再原子重命名为 ${input.paths.ruleSopMarkdown}。`,
    'JSON 必须包含 version=1、result_id、status="ready|skipped"、summary、rule_id。',
    "不得执行任何飞书或 Base 写入。",
  ].join("\n\n");
}

async function preparePipeline(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: ArgosAgentOrchestratorDependencies;
  paths: ArgosAgentArtifactPaths;
  resultId: string;
}): Promise<ArgosPreparedAgentData> {
  await ensureArgosArtifactDirectories(input.paths);
  const workItem = buildWorkItem(input.execution, input.resultId);
  await Promise.all([
    writeArgosJsonAtomic(input.paths.workItem, [workItem]),
    writeArgosJsonAtomic(input.paths.workItems, [workItem]),
    writeArgosJsonAtomic(input.paths.runInput, {
      version: 1,
      result_id: input.resultId,
      queue_item_id: input.execution.item.id,
      attempt: input.execution.item.attempts,
      trigger: input.execution.item.trigger,
      processing_instructions: input.execution.prompt,
      writeback_owner: "parent_orchestrator",
    }),
  ]);
  const prepared = await input.dependencies.prepareAgentData({
    config: input.execution.config,
    workspaceCwd: input.execution.workspace.cwd,
    workItemFile: input.paths.workItem,
    outputDirectory: input.paths.preparedDirectory,
    auditFile: input.paths.preparedAudit,
    commandEnvironment: input.execution.commandEnvironment,
  });
  await writeArgosJsonAtomic(input.paths.investigationInput, {
    version: 1,
    result_id: input.resultId,
    prepared_input_file: prepared.input_file,
    inspect_file: prepared.inspect_file,
    work_item_file: input.paths.workItem,
    output_files: {
      result: input.paths.investigationResult,
      report: input.paths.investigationReport,
      rule_sop_draft: input.paths.ruleSopDraft,
    },
  });
  return prepared;
}

async function runInvestigation(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: ArgosAgentArtifactPaths;
  resultId: string;
}): Promise<{ agentId: string; result: ArgosInvestigationResult }> {
  const agent = await input.execution.launchAgent({
    stage: "investigation",
    title: `Argos 排查 · ${input.resultId}`,
    prompt: investigationPrompt(input),
    outputSchema: STAGE_OUTPUT_SCHEMA,
    labels: { argosAgentRole: "investigation", argosResultId: input.resultId },
  });
  const result = await readArgosInvestigationResult(input.paths.investigationResult);
  await readArgosMarkdown(input.paths.investigationReport, "Argos 排查报告");
  await readArgosMarkdown(input.paths.ruleSopDraft, "Argos 规则 SOP 草稿");
  return { agentId: agent.agentId, result };
}

async function runSopSummary(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: ArgosAgentArtifactPaths;
  resultId: string;
}): Promise<{ totalMarkdown: string; ruleMarkdown: string }> {
  await writeArgosJsonAtomic(input.paths.sopSummaryInput, {
    version: 1,
    result_id: input.resultId,
    prepared_audit: input.paths.preparedAudit,
    investigation_result: input.paths.investigationResult,
    investigation_report: input.paths.investigationReport,
    rule_sop_draft: input.paths.ruleSopDraft,
    output_files: {
      result: input.paths.sopSummaryResult,
      total_sop_markdown: input.paths.totalSopMarkdown,
      rule_sop_markdown: input.paths.ruleSopMarkdown,
    },
  });
  await input.execution.launchAgent({
    stage: "sop_summary",
    title: `Argos SOP 汇总 · ${input.resultId}`,
    prompt: sopSummaryPrompt(input),
    outputSchema: STAGE_OUTPUT_SCHEMA,
    labels: { argosAgentRole: "sop_summary", argosResultId: input.resultId },
  });
  const summary = await readArgosSopSummaryResult(input.paths.sopSummaryResult);
  if (summary.status === "skipped") return { totalMarkdown: "", ruleMarkdown: "" };
  return {
    totalMarkdown: await readArgosMarkdown(input.paths.totalSopMarkdown, "Argos 通用 SOP"),
    ruleMarkdown: await readArgosMarkdown(input.paths.ruleSopMarkdown, "Argos 规则 SOP"),
  };
}

async function publishArtifacts(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: ArgosAgentOrchestratorDependencies;
  paths: ArgosAgentArtifactPaths;
  investigation: ArgosInvestigationResult;
  totalMarkdown: string;
  ruleMarkdown: string;
}): Promise<{
  document: ArgosDocumentPublication;
  totalSop: ArgosSopPublication;
  ruleSop: ArgosSopPublication;
}> {
  const report = await readArgosMarkdown(input.paths.investigationReport, "Argos 排查报告");
  await writeArgosJsonAtomic(input.paths.investigationResult, {
    ...input.investigation,
    ai_summary: input.investigation.summary,
    result_markdown: report,
    total_sop_markdown: input.totalMarkdown,
    rule_sop_markdown: input.ruleMarkdown,
  });
  const document = await input.dependencies.publishDocument({
    workspaceCwd: input.execution.workspace.cwd,
    workItemFile: input.paths.workItem,
    resultFile: input.paths.investigationResult,
    auditFile: input.paths.publishDocumentAudit,
    commandEnvironment: input.execution.commandEnvironment,
  });
  if (document.doc_archive_status !== "created" && document.doc_archive_status !== "updated") {
    throw new Error(`Argos 排查文档发布失败：${document.doc_archive_reason ?? "未归档"}`);
  }
  const totalInput = path.join(input.paths.runDirectory, "sop-summary", "publish-total-input.json");
  const ruleInput = path.join(input.paths.runDirectory, "sop-summary", "publish-rule-input.json");
  await Promise.all([
    writeArgosJsonAtomic(totalInput, {
      type: "total",
      troubleshooting_sop_doc: input.execution.config.troubleshootingSopDoc,
      markdown: input.totalMarkdown,
    }),
    writeArgosJsonAtomic(ruleInput, {
      type: "rule",
      troubleshooting_sop_doc: input.execution.config.troubleshootingSopDoc,
      rule_id: input.investigation.rule_id,
      rule_name: input.investigation.rule_name,
      markdown: input.ruleMarkdown,
    }),
  ]);
  const [totalSop, ruleSop] = await Promise.all([
    input.dependencies.publishSop({
      workspaceCwd: input.execution.workspace.cwd,
      inputFile: totalInput,
      auditFile: input.paths.publishTotalSopAudit,
      commandEnvironment: input.execution.commandEnvironment,
    }),
    input.dependencies.publishSop({
      workspaceCwd: input.execution.workspace.cwd,
      inputFile: ruleInput,
      auditFile: input.paths.publishRuleSopAudit,
      commandEnvironment: input.execution.commandEnvironment,
    }),
  ]);
  if (totalSop.total_sop_writeback_status === "failed") {
    throw new Error(
      `Argos 通用 SOP 发布失败：${totalSop.total_sop_writeback_reason ?? "未知错误"}`,
    );
  }
  if (ruleSop.sop_writeback_status === "failed") {
    throw new Error(`Argos 规则 SOP 发布失败：${ruleSop.sop_writeback_reason ?? "未知错误"}`);
  }
  await writeArgosJsonAtomic(input.paths.investigationResult, {
    ...input.investigation,
    success: true,
    ai_summary: input.investigation.summary,
    ai_result: document.ai_result,
    feishu_doc_url: document.ai_result,
    doc_url: document.ai_result,
    doc_token: document.doc_token,
    doc_archive_status: document.doc_archive_status,
    doc_write_status: document.doc_write_status,
    result_markdown: report,
    total_sop_markdown: input.totalMarkdown,
    rule_sop_markdown: input.ruleMarkdown,
    ...totalSop,
    ...ruleSop,
    writeback_owner: "parent_orchestrator",
  });
  return { document, totalSop, ruleSop };
}

async function runReviewedInvestigation(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: ArgosAgentOrchestratorDependencies;
  paths: ArgosAgentArtifactPaths;
  resultId: string;
}): Promise<{
  investigation: { agentId: string; result: ArgosInvestigationResult };
}> {
  let investigation = await runInvestigation(input);
  for (let round = 1; ; round += 1) {
    if (investigation.result.status === "pending") {
      await writeArgosJsonAtomic(input.paths.investigationResult, {
        ...investigation.result,
        ai_summary: investigation.result.summary,
      });
      return { investigation };
    }
    const sop = await runSopSummary(input);
    await publishArtifacts({
      ...input,
      investigation: investigation.result,
      totalMarkdown: sop.totalMarkdown,
      ruleMarkdown: sop.ruleMarkdown,
    });
    await clearArgosReviewResult(input.paths);
    const validation = await input.dependencies.validateResultDirectory({
      workspaceCwd: input.execution.workspace.cwd,
      resultDirectory: input.paths.runDirectory,
      workItemsFile: input.paths.workItems,
      auditFile: input.paths.preReviewValidationAudit,
      commandEnvironment: input.execution.commandEnvironment,
    });
    const review = await reviewArgosAgentArtifacts({
      execution: input.execution,
      paths: input.paths,
      resultId: input.resultId,
      validation,
      round,
    });
    if (review.passed) return { investigation };
    if (round > MAX_REVIEW_REWORKS) {
      throw new AlertTroubleshooterPendingError(
        `Argos 排查审核经过 ${MAX_REVIEW_REWORKS} 次返工后仍未通过：${
          review.blockers.join("；") || review.reviewSummary
        }`,
        "review_rework_exhausted",
      );
    }
    await input.execution.continueAgent(investigation.agentId, {
      stage: "investigation_rework",
      prompt: buildArgosInvestigationReworkPrompt({
        resultId: input.resultId,
        review,
        paths: input.paths,
      }),
      outputSchema: STAGE_OUTPUT_SCHEMA,
    });
    investigation = {
      agentId: investigation.agentId,
      result: await readArgosInvestigationResult(input.paths.investigationResult),
    };
    await readArgosMarkdown(input.paths.investigationReport, "返工后的 Argos 排查报告");
    await readArgosMarkdown(input.paths.ruleSopDraft, "返工后的 Argos 规则 SOP 草稿");
  }
}

function closeWarning(close: ArgosCloseReadyResult): string | undefined {
  const failures = close.results.flatMap((result) => {
    const warnings: string[] = [];
    if (result.doc_archive_status === "failed") warnings.push("排查文档归档失败");
    if (result.total_sop_writeback_status === "failed") warnings.push("通用 SOP 写回失败");
    if (result.sop_writeback_status === "failed") warnings.push("规则 SOP 写回失败");
    if (result.message_reply_status === "failed") warnings.push("群消息回复失败");
    return warnings;
  });
  return failures.length > 0
    ? `Argos 业务状态已关闭，但存在副作用失败：${failures.join("、")}`
    : undefined;
}

async function runFinalReport(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  dependencies: ArgosAgentOrchestratorDependencies;
  paths: ArgosAgentArtifactPaths;
  close: ArgosCloseReadyResult;
}): Promise<{
  warning?: string;
  report?: ReturnType<typeof buildArgosTaskRunReport>;
}> {
  try {
    const dateKeys = Array.from(
      { length: input.execution.config.dateLookbackDays },
      (_, offset) => {
        const date = new Date();
        date.setDate(date.getDate() - offset);
        return new Intl.DateTimeFormat("zh-CN", {
          timeZone: "Asia/Shanghai",
          year: "numeric",
          month: "2-digit",
          day: "2-digit",
        })
          .formatToParts(date)
          .filter((part) => part.type !== "literal")
          .map((part) => part.value)
          .join("");
      },
    );
    const summary = await input.dependencies.buildRunSummary({
      workspaceCwd: input.execution.workspace.cwd,
      scanDirectoryUrl: input.execution.config.attributionRecordRoot,
      resultDirectory: input.paths.runDirectory,
      workItemsFile: input.paths.workItems,
      auditFile: input.paths.runSummary,
      dateKeys,
      commandEnvironment: input.execution.commandEnvironment,
    });
    const report = await input.dependencies.renderRunReport({
      workspaceCwd: input.execution.workspace.cwd,
      resultDirectory: input.paths.runDirectory,
      runSummaryFile: input.paths.runSummary,
      auditFile: input.paths.runReport,
      commandEnvironment: input.execution.commandEnvironment,
    });
    return {
      ...(!report.ready_to_report_complete
        ? {
            warning: `最终 drain 尚未清零：${report.ready_to_report_complete_reason}`,
          }
        : {}),
      report: buildArgosTaskRunReport({ summary, report, close: input.close }),
    };
  } catch (error) {
    return {
      warning: `Argos 业务状态已关闭，但 drain/report 生成失败：${
        error instanceof Error ? error.message : String(error)
      }`,
    };
  }
}

export async function executeArgosAgentPipeline(
  input: AlertTroubleshooterRecordExecutionInput,
  dependencies: ArgosAgentOrchestratorDependencies = defaultArgosAgentOrchestratorDependencies,
): Promise<AlertTroubleshooterRecordExecutionResult> {
  const resultId = input.record.resultId?.trim();
  if (!resultId) throw new Error("Argos 排查记录缺少 result_id");
  const paths = argosAgentArtifactPaths({
    workspaceCwd: input.workspace.cwd,
    resultId,
    queueItemId: input.item.id,
    attempt: input.item.attempts,
  });
  await preparePipeline({ execution: input, dependencies, paths, resultId });
  const { investigation } = await runReviewedInvestigation({
    execution: input,
    dependencies,
    paths,
    resultId,
  });
  const validation: ArgosResultDirectoryValidation = await dependencies.validateResultDirectory({
    workspaceCwd: input.workspace.cwd,
    resultDirectory: paths.runDirectory,
    workItemsFile: paths.workItems,
    auditFile: paths.finalValidationAudit,
    commandEnvironment: input.commandEnvironment,
  });
  const readiness = validation.per_result_close_readiness[resultId];
  if (!validation.success || readiness?.ready_for_close !== true) {
    throw new AlertTroubleshooterPendingError(
      `Argos 结果目录未通过 close 门禁：${readiness?.blockers.join("；") || "未知阻塞项"}`,
      "close_readiness_blocked",
    );
  }
  const close = await dependencies.closeReadyWorkItem({
    workspaceCwd: input.workspace.cwd,
    resultDirectory: paths.runDirectory,
    workItemsFile: paths.workItems,
    auditFile: paths.closeAudit,
    commandEnvironment: input.commandEnvironment,
  });
  if (close.closed !== 1 || close.skipped !== 0) {
    throw new Error(`Argos Runner close 未完成业务闭环：${JSON.stringify(close)}`);
  }
  const final = await runFinalReport({
    execution: input,
    dependencies,
    paths,
    close,
  });
  const warning = [closeWarning(close), final.warning].filter(Boolean).join("；");
  const finalResult = await readArgosInvestigationResult(paths.investigationResult);
  const published = JSON.parse(await readFile(paths.investigationResult, "utf8")) as {
    ai_result?: string;
  };
  return {
    agentId: investigation.agentId,
    completion: {
      status: finalResult.status,
      summary: finalResult.summary,
      ...(published.ai_result ? { documentUrl: published.ai_result } : {}),
    },
    persistenceHandled: true,
    ...(warning ? { completionWarning: warning } : {}),
    ...(final.report ? { report: final.report } : {}),
  };
}
