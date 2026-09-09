import { access, mkdir, readFile, rename, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";
import { BambooReviewResultSchema, type BambooReviewResult } from "./bamboo-review-result.js";

const InvestigationResultSchema = z
  .object({
    version: z.literal(1),
    result_id: z.string().trim().min(1),
    status: z.enum(["succeeded", "pending", "not_support"]),
    summary: z.string().trim().min(1),
    attribution_result: z.string().trim().optional(),
    rule_id: z.string().trim().optional(),
    confidence: z.union([z.number().min(0).max(1), z.string().trim().min(1)]).optional(),
    sample_count_authority: z
      .object({
        source: z.string().trim().min(1),
      })
      .passthrough()
      .optional(),
    sample_checks: z.array(z.unknown()).optional(),
    evidence_items: z.array(z.unknown()).optional(),
    pending_admission: z.record(z.string(), z.unknown()).optional(),
    waiting_for_user_authorization: z.boolean().optional(),
    writeback_owner: z.literal("parent_orchestrator"),
  })
  .passthrough()
  .superRefine((result, context) => {
    if (result.status === "succeeded") {
      for (const field of [
        "attribution_result",
        "confidence",
        "sample_count_authority",
        "sample_checks",
        "evidence_items",
      ] as const) {
        if (result[field] === undefined) {
          context.addIssue({
            code: "custom",
            path: [field],
            message: `status=succeeded 时必须提供 ${field}`,
          });
        }
      }
    }
    if (result.status === "pending" && result.pending_admission === undefined) {
      context.addIssue({
        code: "custom",
        path: ["pending_admission"],
        message: "status=pending 时必须提供结构化 pending_admission",
      });
    }
  });

const SopSummaryResultSchema = z
  .object({
    version: z.literal(1),
    result_id: z.string().trim().min(1),
    status: z.enum(["ready", "skipped"]),
    summary: z.string().trim().min(1),
    rule_id: z.string().trim().optional(),
  })
  .passthrough();

export type BambooInvestigationResult = z.infer<typeof InvestigationResultSchema>;
export type BambooSopSummaryResult = z.infer<typeof SopSummaryResultSchema>;
export type { BambooReviewResult } from "./bamboo-review-result.js";

export interface BambooAgentArtifactPaths {
  runDirectory: string;
  runInput: string;
  preparedDirectory: string;
  preparedAudit: string;
  workItem: string;
  workItems: string;
  resultWorkItems: string;
  investigationInput: string;
  investigationResult: string;
  investigationReport: string;
  ruleSopDraft: string;
  sopSummaryInput: string;
  sopSummaryResult: string;
  sopSummaryMarkdown: string;
  publishDocumentAudit: string;
  publishSopAudit: string;
  modelValidationAudit: string;
  resultDirectoryValidationAudit: string;
  reviewInput: string;
  reviewResult: string;
  closeReadyAudit: string;
  closeAudit: string;
  autoDrainAudit: string;
  runSummary: string;
  runReport: string;
  previousReviewResult: string | null;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}

export function bambooAgentArtifactPaths(input: {
  workspaceCwd: string;
  resultId: string;
  queueItemId: string;
  attempt: number;
}): BambooAgentArtifactPaths {
  const runDirectory = path.join(
    input.workspaceCwd,
    ".tmp",
    "bamboo-agent-runs",
    safeSegment(input.resultId),
    `${safeSegment(input.queueItemId)}-attempt-${input.attempt}`,
  );
  const previousReviewResult =
    input.attempt > 1
      ? path.join(
          path.dirname(runDirectory),
          `${safeSegment(input.queueItemId)}-attempt-${input.attempt - 1}`,
          `${safeSegment(input.resultId)}.review.json`,
        )
      : null;
  return {
    runDirectory,
    runInput: path.join(runDirectory, "run-input.json"),
    preparedDirectory: path.join(runDirectory, "prepared"),
    preparedAudit: path.join(runDirectory, "prepared", "prepare-result.json"),
    workItem: path.join(runDirectory, `work-item-${safeSegment(input.resultId)}.json`),
    workItems: path.join(runDirectory, "work-items.json"),
    resultWorkItems: path.join(runDirectory, `work-items-${safeSegment(input.resultId)}.json`),
    investigationInput: path.join(runDirectory, "investigation", "input.json"),
    investigationResult: path.join(runDirectory, `${safeSegment(input.resultId)}.json`),
    investigationReport: path.join(runDirectory, `${safeSegment(input.resultId)}.md`),
    ruleSopDraft: path.join(runDirectory, "investigation", "rule-sop-draft.md"),
    sopSummaryInput: path.join(runDirectory, "sop-summary", "input.json"),
    sopSummaryResult: path.join(runDirectory, "sop-summary", "result.json"),
    sopSummaryMarkdown: path.join(runDirectory, "sop-summary", "summary.md"),
    publishDocumentAudit: path.join(
      runDirectory,
      `publish-doc-${safeSegment(input.resultId)}.json`,
    ),
    publishSopAudit: path.join(runDirectory, `publish-sop-${safeSegment(input.resultId)}.json`),
    modelValidationAudit: path.join(runDirectory, `validate-${safeSegment(input.resultId)}.json`),
    resultDirectoryValidationAudit: path.join(runDirectory, "validate-result-dir.json"),
    reviewInput: path.join(runDirectory, "review", "input.json"),
    reviewResult: path.join(runDirectory, `${safeSegment(input.resultId)}.review.json`),
    closeReadyAudit: path.join(runDirectory, "close-ready.json"),
    closeAudit: path.join(runDirectory, `close-${safeSegment(input.resultId)}.json`),
    autoDrainAudit: path.join(runDirectory, "auto-troubleshoot-drain.json"),
    runSummary: path.join(runDirectory, "run-summary.json"),
    runReport: path.join(runDirectory, "run-report.json"),
    previousReviewResult,
  };
}

export async function existingBambooArtifact(filePath: string | null): Promise<string | null> {
  if (!filePath) return null;
  try {
    await access(filePath);
    return filePath;
  } catch {
    return null;
  }
}

export async function ensureBambooAgentArtifactDirectories(
  paths: BambooAgentArtifactPaths,
): Promise<void> {
  await Promise.all([
    mkdir(paths.preparedDirectory, { recursive: true }),
    mkdir(path.dirname(paths.investigationInput), { recursive: true }),
    mkdir(path.dirname(paths.sopSummaryInput), { recursive: true }),
    mkdir(path.dirname(paths.reviewInput), { recursive: true }),
  ]);
}

export async function writeBambooAgentJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  const temporaryPath = `${filePath}.tmp`;
  await writeFile(temporaryPath, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(temporaryPath, filePath);
}

async function readFinalJson<T>(
  filePath: string,
  schema: z.ZodType<T>,
  artifactName: string,
): Promise<T> {
  let raw: string;
  try {
    raw = await readFile(filePath, "utf8");
  } catch (error) {
    const temporaryPath = `${filePath}.tmp`;
    let temporaryFileExists = false;
    try {
      await readFile(temporaryPath, "utf8");
      temporaryFileExists = true;
    } catch {
      // The final error below includes the expected final path.
    }
    if (temporaryFileExists) {
      throw new Error(`${artifactName} 仍是 .tmp 文件，Agent 尚未完成原子提交`, {
        cause: error,
      });
    }
    throw new Error(`${artifactName} 未生成：${filePath}`, { cause: error });
  }
  let value: unknown;
  try {
    value = JSON.parse(raw);
  } catch (error) {
    throw new Error(`${artifactName} 不是有效 JSON：${filePath}`, { cause: error });
  }
  const parsed = schema.safeParse(value);
  if (!parsed.success) {
    throw new Error(`${artifactName} 不符合约定：${parsed.error.message}`);
  }
  return parsed.data;
}

export function readBambooInvestigationResult(
  filePath: string,
): Promise<BambooInvestigationResult> {
  return readFinalJson(filePath, InvestigationResultSchema, "排查结果");
}

export function readBambooSopSummaryResult(filePath: string): Promise<BambooSopSummaryResult> {
  return readFinalJson(filePath, SopSummaryResultSchema, "SOP 汇总结果");
}

export function readBambooReviewResult(filePath: string): Promise<BambooReviewResult> {
  return readFinalJson(filePath, BambooReviewResultSchema, "审核结果");
}

export async function readRequiredBambooMarkdown(
  filePath: string,
  artifactName: string,
): Promise<string> {
  let markdown: string;
  try {
    markdown = await readFile(filePath, "utf8");
  } catch (error) {
    let temporaryFileExists = false;
    try {
      await access(`${filePath}.tmp`);
      temporaryFileExists = true;
    } catch {
      // The final error below includes the expected final path.
    }
    if (temporaryFileExists) {
      throw new Error(`${artifactName} 仍是 .tmp 文件，Agent 尚未完成原子提交`, {
        cause: error,
      });
    }
    throw new Error(`${artifactName} 未生成：${filePath}`, { cause: error });
  }
  if (!markdown.trim()) throw new Error(`${artifactName} 内容为空：${filePath}`);
  return markdown;
}

export function buildBambooLocalValidation(input: {
  resultId: string;
  investigation: BambooInvestigationResult;
  reportMarkdown: string;
  sopSummary: BambooSopSummaryResult;
  sopMarkdown: string;
}): {
  valid: boolean;
  validation_command: string;
  blockers: string[];
  checked_files: string[];
} {
  const blockers: string[] = [];
  if (input.investigation.result_id !== input.resultId) {
    blockers.push("investigation_result_id_mismatch");
  }
  if (input.sopSummary.result_id !== input.resultId) {
    blockers.push("sop_summary_result_id_mismatch");
  }
  if (/\b(?:TBD|TODO)\b|请填写|填写指引|骨架自动生成/iu.test(input.reportMarkdown)) {
    blockers.push("investigation_report_contains_placeholder");
  }
  if (
    input.sopSummary.status === "ready" &&
    (input.sopMarkdown.trim().length < 20 ||
      /\b(?:TBD|TODO)\b|请填写|填写指引|骨架自动生成/iu.test(input.sopMarkdown))
  ) {
    blockers.push("sop_summary_is_incomplete");
  }
  return {
    valid: blockers.length === 0,
    validation_command: "paseo:bamboo-agent-artifact-validator@v1",
    blockers,
    checked_files: [],
  };
}
