import path from "node:path";
import type { AlertTroubleshooterRecordExecutionInput } from "./alert-troubleshooter-agent-execution.js";
import {
  readArgosReviewResult,
  writeArgosJsonAtomic,
  type ArgosAgentArtifactPaths,
} from "./argos-agent-artifact-store.js";
import type { ArgosResultDirectoryValidation } from "./argos-agent-runner.js";

const REVIEW_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["completed"] },
    artifacts: { type: "array", items: { type: "string" } },
  },
  required: ["status", "artifacts"],
  additionalProperties: false,
};

export interface ArgosAgentReviewDecision {
  passed: boolean;
  blockers: string[];
  requiredReworkPrompt: string;
  reviewSummary: string;
  auditFile: string;
}

function runnerBlockers(validation: ArgosResultDirectoryValidation, resultId: string): string[] {
  const blockers = validation.per_result_close_readiness[resultId]?.blockers ?? [];
  return blockers.filter((blocker) => blocker !== "missing_review_audit");
}

export async function reviewArgosAgentArtifacts(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: ArgosAgentArtifactPaths;
  resultId: string;
  validation: ArgosResultDirectoryValidation;
  round: number;
}): Promise<ArgosAgentReviewDecision> {
  const checkedFiles = [
    input.paths.workItem,
    input.paths.preparedAudit,
    input.paths.investigationResult,
    input.paths.investigationReport,
    input.paths.publishDocumentAudit,
    input.paths.publishTotalSopAudit,
    input.paths.publishRuleSopAudit,
    input.paths.preReviewValidationAudit,
  ];
  await writeArgosJsonAtomic(input.paths.reviewInput, {
    version: 1,
    result_id: input.resultId,
    round: input.round,
    checked_files: checkedFiles,
    output_file: input.paths.reviewResult,
  });
  await input.execution.launchAgent({
    stage: "review",
    title: `Argos 审核 · ${input.resultId} · 第 ${input.round} 轮`,
    prompt: [
      "你是 Argos 排查独立审核 Agent。你拥有 fresh context，只进行只读审核。",
      "先运行 `life-settle-ai-assistant argos_alarm guide alerts-auto-troubleshoot`，并遵循 Argos Runner close 门禁。",
      `审核输入清单：${input.paths.reviewInput}`,
      `必须逐一检查：${checkedFiles.join("、")}`,
      "核对报警标识、当前告警窗口证据、历史结论复核、固定归因枚举、证据类别、排查文档、SOP 产物、发布审计和 Runner 预校验。",
      "不得修改排查结果，不得执行 Base、文档、SOP、卡片或群消息写入，不得关闭任务。",
      `先写 ${input.paths.reviewResult}.tmp，再原子重命名为 ${input.paths.reviewResult}。`,
      "JSON 必须包含 review_passed、blockers[]、required_rework_prompt、checked_files[]、validation_command、review_summary。",
      "审核不通过时，required_rework_prompt 必须给出可直接交回原排查 Agent 的返工要求。",
      "最终回复只确认审核文件已生成。",
    ].join("\n\n"),
    outputSchema: REVIEW_OUTPUT_SCHEMA,
    labels: {
      argosAgentRole: "review",
      argosResultId: input.resultId,
      argosReviewRound: String(input.round),
    },
  });
  const review = await readArgosReviewResult(input.paths.reviewResult);
  const auditFile = path.join(input.paths.runDirectory, "review", `round-${input.round}.json`);
  await writeArgosJsonAtomic(auditFile, review);
  const unchecked = checkedFiles.filter((file) => !review.checked_files.includes(file));
  const blockers = [
    ...runnerBlockers(input.validation, input.resultId),
    ...review.blockers,
    ...unchecked.map((file) => `review_did_not_check:${file}`),
  ];
  return {
    passed: review.review_passed && blockers.length === 0,
    blockers,
    requiredReworkPrompt: review.required_rework_prompt,
    reviewSummary: review.review_summary,
    auditFile,
  };
}

export function buildArgosInvestigationReworkPrompt(input: {
  resultId: string;
  review: ArgosAgentReviewDecision;
  paths: ArgosAgentArtifactPaths;
}): string {
  return [
    `继续返工 Argos result_id ${input.resultId}，只处理当前记录。`,
    `独立审核审计：${input.review.auditFile}`,
    `审核阻塞项：${input.review.blockers.join("；") || input.review.reviewSummary}`,
    input.review.requiredReworkPrompt
      ? `审核返工要求：${input.review.requiredReworkPrompt}`
      : "补齐缺失证据和结论。",
    `重新读取单条准备数据：${input.paths.preparedAudit}`,
    `重新读取排查输入：${input.paths.investigationInput}`,
    `修正结果先写 ${input.paths.investigationResult}.tmp，再原子重命名为 ${input.paths.investigationResult}。`,
    `修正报告先写 ${input.paths.investigationReport}.tmp，再原子重命名为 ${input.paths.investigationReport}。`,
    `修正规则 SOP 草稿先写 ${input.paths.ruleSopDraft}.tmp，再原子重命名为 ${input.paths.ruleSopDraft}。`,
    '结果必须继续声明 writeback_owner="parent_orchestrator"，不得执行任何写回副作用。',
  ].join("\n\n");
}
