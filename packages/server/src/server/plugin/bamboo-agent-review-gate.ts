import path from "node:path";
import type { AlertTroubleshooterRecordExecutionInput } from "./alert-troubleshooter-agent-execution.js";
import {
  readBambooReviewResult,
  writeBambooAgentJsonAtomic,
  type BambooAgentArtifactPaths,
  type BambooReviewResult,
} from "./bamboo-agent-artifact-store.js";
import type { BambooModelValidation } from "./bamboo-agent-runner.js";

const REVIEW_OUTPUT_SCHEMA: Record<string, unknown> = {
  type: "object",
  properties: {
    status: { type: "string", enum: ["completed"] },
    artifacts: { type: "array", items: { type: "string" } },
  },
  required: ["status", "artifacts"],
  additionalProperties: false,
};

export interface BambooAgentReviewDecision {
  passed: boolean;
  blockers: string[];
  requiredReworkPrompt: string;
  reviewSummary: string;
  auditFile: string;
}

function modelValidationPassed(validation: BambooModelValidation): boolean {
  return validation.overallValid === true || validation.overall_valid === true;
}

function reviewPrompt(input: {
  reviewInput: string;
  reviewResult: string;
  checkedFiles: readonly string[];
  round: number;
}): string {
  return [
    "你是 Bamboo 排查审核 Agent。你拥有独立 fresh context，只进行只读审核。",
    "先运行 `life-settle-ai-assistant guide bamboo-alert-groups-scan-and-troubleshoot`，严格执行最终发布审计和 close 门禁。",
    `审核轮次：${input.round}`,
    `审核输入清单：${input.reviewInput}`,
    `必须逐一检查：${input.checkedFiles.join("、")}`,
    "不得修改排查结果、不得执行飞书/Base/Bamboo/群消息写入、不得关闭任务。",
    "必须核对最终 result JSON、最终发布 audit 的 mergedMarkdown、SOP audit 和 Runner validator 输出；任一缺失、validator 未通过、发布正文仍含占位内容时必须 review_passed=false。",
    `先把审核 JSON 写入 ${input.reviewResult}.tmp，再原子重命名为 ${input.reviewResult}。`,
    "JSON 必须包含 review_passed、blockers[]、required_rework_prompt、checked_files[]、validation_command、review_summary。",
    "审核不通过时，required_rework_prompt 必须给出可直接交回原排查 Agent 的明确返工要求。",
    "最终回复只确认审核文件已经完成，不要在回复中传递审核正文。",
  ].join("\n\n");
}

function reviewBlockers(input: {
  validation: BambooModelValidation;
  review: BambooReviewResult;
  checkedFiles: readonly string[];
}): string[] {
  const uncheckedFiles = input.checkedFiles.filter(
    (file) => !input.review.checked_files.includes(file),
  );
  return [
    ...(modelValidationPassed(input.validation)
      ? []
      : [
          input.validation.hardFailCode ??
            input.validation.hard_fail_code ??
            "runner_model_validation_failed",
        ]),
    ...input.review.blockers,
    ...uncheckedFiles.map((file) => `review_did_not_check:${file}`),
  ];
}

export async function reviewBambooAgentArtifacts(input: {
  execution: AlertTroubleshooterRecordExecutionInput;
  paths: BambooAgentArtifactPaths;
  resultId: string;
  validation: BambooModelValidation;
  round: number;
}): Promise<BambooAgentReviewDecision> {
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
    round: input.round,
    checked_files: checkedFiles,
    output_file: input.paths.reviewResult,
  });
  await input.execution.launchAgent({
    stage: "review",
    title: `Bamboo 审核 · ${input.resultId} · 第 ${input.round} 轮`,
    prompt: reviewPrompt({
      reviewInput: input.paths.reviewInput,
      reviewResult: input.paths.reviewResult,
      checkedFiles,
      round: input.round,
    }),
    outputSchema: REVIEW_OUTPUT_SCHEMA,
    labels: {
      bambooAgentRole: "review",
      bambooResultId: input.resultId,
      bambooReviewRound: String(input.round),
    },
  });
  const review = await readBambooReviewResult(input.paths.reviewResult);
  const auditFile = path.join(input.paths.runDirectory, "review", `round-${input.round}.json`);
  await writeBambooAgentJsonAtomic(auditFile, review);
  const blockers = reviewBlockers({
    validation: input.validation,
    review,
    checkedFiles,
  });
  return {
    passed: review.review_passed && blockers.length === 0,
    blockers,
    requiredReworkPrompt: review.required_rework_prompt.trim(),
    reviewSummary: review.review_summary,
    auditFile,
  };
}

export function buildBambooInvestigationReworkPrompt(input: {
  resultId: string;
  review: BambooAgentReviewDecision;
  paths: BambooAgentArtifactPaths;
}): string {
  return [
    `继续返工 Bamboo result_id ${input.resultId}。这是同一个排查 Agent 的后续轮次，不要创建新任务或处理其它记录。`,
    `独立审核审计：${input.review.auditFile}`,
    `审核阻塞项：${input.review.blockers.join("；") || input.review.reviewSummary}`,
    input.review.requiredReworkPrompt
      ? `审核返工要求：${input.review.requiredReworkPrompt}`
      : "根据审核阻塞项补齐证据和结论。",
    `重新读取准备数据：${input.paths.preparedAudit}`,
    `重新读取任务输入：${input.paths.investigationInput}`,
    `先把修正后的结果 JSON 写入 ${input.paths.investigationResult}.tmp，再原子重命名为 ${input.paths.investigationResult}。`,
    `先把修正后的排查报告写入 ${input.paths.investigationReport}.tmp，再原子重命名为 ${input.paths.investigationReport}。`,
    `先把修正后的规则 SOP 草稿写入 ${input.paths.ruleSopDraft}.tmp，再原子重命名为 ${input.paths.ruleSopDraft}。`,
    '结果仍须声明 writeback_owner="parent_orchestrator"。不得执行 Base、飞书文档、Bamboo 卡片或群消息写副作用。',
    "最终回复只确认返工文件已经完成。",
  ].join("\n\n");
}
