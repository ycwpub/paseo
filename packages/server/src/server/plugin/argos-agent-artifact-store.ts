import { access, mkdir, readFile, rename, rm, writeFile } from "node:fs/promises";
import path from "node:path";
import { z } from "zod";

const EvidenceSchema = z
  .object({
    category: z.string().trim().optional(),
    type: z.string().trim().optional(),
    source: z.string().trim().optional(),
    tool: z.string().trim().optional(),
    summary: z.string().trim().optional(),
    evidence: z.string().trim().optional(),
    detail: z.string().trim().optional(),
  })
  .passthrough();

const InvestigationResultSchema = z
  .object({
    version: z.literal(1),
    result_id: z.string().trim().min(1),
    status: z.enum(["succeeded", "pending"]),
    summary: z.string().trim().min(1),
    attribution_result: z.string().trim().min(1),
    rule_id: z.string().trim().min(1),
    rule_name: z.string().trim().min(1),
    psm: z.string().trim().optional(),
    confidence: z.union([z.number().min(0).max(1), z.string().trim().min(1)]).optional(),
    evidence_items: z.array(EvidenceSchema).default([]),
    investigation_evidence: z.array(EvidenceSchema).optional(),
    pending_reason: z.string().trim().optional(),
    writeback_owner: z.literal("parent_orchestrator"),
  })
  .passthrough()
  .superRefine((result, context) => {
    if (
      result.status === "succeeded" &&
      result.evidence_items.length === 0 &&
      (result.investigation_evidence?.length ?? 0) === 0
    ) {
      context.addIssue({
        code: "custom",
        path: ["evidence_items"],
        message: "status=succeeded 时必须提供可复核证据",
      });
    }
    if (result.status === "pending" && !result.pending_reason) {
      context.addIssue({
        code: "custom",
        path: ["pending_reason"],
        message: "status=pending 时必须说明阻塞原因",
      });
    }
  });

const SopSummaryResultSchema = z
  .object({
    version: z.literal(1),
    result_id: z.string().trim().min(1),
    status: z.enum(["ready", "skipped"]),
    summary: z.string().trim().min(1),
    rule_id: z.string().trim().min(1),
  })
  .passthrough();

function normalizeText(value: unknown): unknown {
  if (typeof value === "string") return value;
  if (value === null || value === undefined) return "";
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}

const ReviewResultSchema = z
  .object({
    review_passed: z.boolean(),
    blockers: z.preprocess(
      (value) => (Array.isArray(value) ? value.map(normalizeText) : value),
      z.array(z.string()),
    ),
    required_rework_prompt: z.preprocess(normalizeText, z.string()),
    checked_files: z.preprocess(
      (value) => (Array.isArray(value) ? value.map(normalizeText) : value),
      z.array(z.string()).min(1),
    ),
    validation_command: z.preprocess(normalizeText, z.string().min(1)),
    review_summary: z.preprocess(normalizeText, z.string().min(1)),
  })
  .passthrough();

export type ArgosInvestigationResult = z.infer<typeof InvestigationResultSchema>;
export type ArgosSopSummaryResult = z.infer<typeof SopSummaryResultSchema>;
export type ArgosReviewResult = z.infer<typeof ReviewResultSchema>;

export interface ArgosAgentArtifactPaths {
  runDirectory: string;
  runInput: string;
  preparedDirectory: string;
  preparedAudit: string;
  workItem: string;
  workItems: string;
  investigationInput: string;
  investigationResult: string;
  investigationReport: string;
  ruleSopDraft: string;
  sopSummaryInput: string;
  sopSummaryResult: string;
  totalSopMarkdown: string;
  ruleSopMarkdown: string;
  publishDocumentAudit: string;
  publishTotalSopAudit: string;
  publishRuleSopAudit: string;
  preReviewValidationAudit: string;
  reviewInput: string;
  reviewResult: string;
  finalValidationAudit: string;
  closeAudit: string;
  runSummary: string;
  runReport: string;
}

function safeSegment(value: string): string {
  return value.replace(/[^a-zA-Z0-9._-]/gu, "_");
}

export function argosAgentArtifactPaths(input: {
  workspaceCwd: string;
  resultId: string;
  queueItemId: string;
  attempt: number;
}): ArgosAgentArtifactPaths {
  const runDirectory = path.join(
    input.workspaceCwd,
    ".tmp",
    "argos-agent-runs",
    safeSegment(input.resultId),
    `${safeSegment(input.queueItemId)}-attempt-${input.attempt}`,
  );
  return {
    runDirectory,
    runInput: path.join(runDirectory, "run-input.json"),
    preparedDirectory: path.join(runDirectory, "prepared"),
    preparedAudit: path.join(runDirectory, "prepared", "prepare-result.json"),
    workItem: path.join(runDirectory, `work-items-${safeSegment(input.resultId)}.json`),
    workItems: path.join(runDirectory, "work-items.json"),
    investigationInput: path.join(runDirectory, "investigation", "input.json"),
    investigationResult: path.join(runDirectory, `${safeSegment(input.resultId)}.json`),
    investigationReport: path.join(runDirectory, `${safeSegment(input.resultId)}.md`),
    ruleSopDraft: path.join(runDirectory, "investigation", "rule-sop-draft.md"),
    sopSummaryInput: path.join(runDirectory, "sop-summary", "input.json"),
    sopSummaryResult: path.join(runDirectory, "sop-summary", "result.json"),
    totalSopMarkdown: path.join(runDirectory, "sop-summary", "total-sop.md"),
    ruleSopMarkdown: path.join(runDirectory, "sop-summary", "rule-sop.md"),
    publishDocumentAudit: path.join(
      runDirectory,
      `publish-doc-${safeSegment(input.resultId)}.json`,
    ),
    publishTotalSopAudit: path.join(runDirectory, "publish-total-sop.json"),
    publishRuleSopAudit: path.join(runDirectory, "publish-rule-sop.json"),
    preReviewValidationAudit: path.join(runDirectory, "validate-before-review.json"),
    reviewInput: path.join(runDirectory, "review", "input.json"),
    reviewResult: path.join(runDirectory, `${safeSegment(input.resultId)}.review.json`),
    finalValidationAudit: path.join(runDirectory, "validate-result-dir.json"),
    closeAudit: path.join(runDirectory, `close-${safeSegment(input.resultId)}.json`),
    runSummary: path.join(runDirectory, "run-summary.json"),
    runReport: path.join(runDirectory, "run-report.json"),
  };
}

export async function ensureArgosArtifactDirectories(
  paths: ArgosAgentArtifactPaths,
): Promise<void> {
  await Promise.all([
    mkdir(paths.preparedDirectory, { recursive: true }),
    mkdir(path.dirname(paths.investigationInput), { recursive: true }),
    mkdir(path.dirname(paths.sopSummaryInput), { recursive: true }),
    mkdir(path.dirname(paths.reviewInput), { recursive: true }),
  ]);
}

export async function writeArgosJsonAtomic(filePath: string, value: unknown): Promise<void> {
  await mkdir(path.dirname(filePath), { recursive: true });
  await writeFile(`${filePath}.tmp`, `${JSON.stringify(value, null, 2)}\n`, "utf8");
  await rename(`${filePath}.tmp`, filePath);
}

export async function clearArgosReviewResult(paths: ArgosAgentArtifactPaths): Promise<void> {
  await Promise.all([
    rm(paths.reviewResult, { force: true }),
    rm(`${paths.reviewResult}.tmp`, { force: true }),
  ]);
}

async function readFinalJson<T>(filePath: string, schema: z.ZodType<T>, label: string): Promise<T> {
  let source: string;
  try {
    source = await readFile(filePath, "utf8");
  } catch (error) {
    try {
      await access(`${filePath}.tmp`);
      throw new Error(`${label} 仍是 .tmp 文件，Agent 尚未完成原子提交`, {
        cause: error,
      });
    } catch (temporaryError) {
      if (temporaryError instanceof Error && temporaryError.message.includes("仍是 .tmp 文件")) {
        throw temporaryError;
      }
    }
    throw new Error(`${label} 未生成：${filePath}`, { cause: error });
  }
  const parsed = schema.safeParse(JSON.parse(source));
  if (!parsed.success) throw new Error(`${label} 不符合约定：${parsed.error.message}`);
  return parsed.data;
}

export function readArgosInvestigationResult(filePath: string): Promise<ArgosInvestigationResult> {
  return readFinalJson(filePath, InvestigationResultSchema, "Argos 排查结果");
}

export function readArgosSopSummaryResult(filePath: string): Promise<ArgosSopSummaryResult> {
  return readFinalJson(filePath, SopSummaryResultSchema, "Argos SOP 汇总结果");
}

export function readArgosReviewResult(filePath: string): Promise<ArgosReviewResult> {
  return readFinalJson(filePath, ReviewResultSchema, "Argos 审核结果");
}

export async function readArgosMarkdown(filePath: string, label: string): Promise<string> {
  const markdown = await readFile(filePath, "utf8");
  if (!markdown.trim()) throw new Error(`${label} 内容为空：${filePath}`);
  return markdown;
}
