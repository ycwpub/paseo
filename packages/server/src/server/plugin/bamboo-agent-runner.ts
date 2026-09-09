import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type { AlertTroubleshooterRecord } from "./alert-troubleshooter-record-store.js";
import { resolveBambooAlertRunnerPath } from "./bamboo-troubleshooter-document-publisher.js";

const execFileAsync = promisify(execFile);
const RUNNER_TIMEOUT_MS = 15 * 60_000;

const PreparedDataSchema = z
  .object({
    result_id: z.string().trim().min(1),
    rule_id: z.string().trim().optional(),
    prepared_data_path: z.string().trim().optional(),
    total_sop_local_path: z.string().trim().optional(),
    rule_sop_local_path: z.string().trim().optional(),
    rule_sop_doc_url: z.string().trim().optional(),
    work_item: z.record(z.string(), z.unknown()).optional(),
  })
  .passthrough();

const SopPublicationSchema = z
  .object({
    success: z.boolean(),
    sop_writeback_status: z.enum(["succeeded", "skipped", "failed"]),
    sop_writeback_reason: z.string().optional(),
    sop_doc_url: z.string().optional(),
  })
  .passthrough();

const ModelValidationSchema = z
  .object({
    overallValid: z.boolean().optional(),
    overall_valid: z.boolean().optional(),
    hardFailCode: z.string().optional(),
    hard_fail_code: z.string().optional(),
    diagnostics: z.array(z.unknown()).optional(),
  })
  .passthrough();

const ResultDirectoryValidationSchema = z
  .object({
    success: z.boolean(),
    close_ready: z.number(),
    close_blocked: z.number(),
    per_result_close_readiness: z.array(
      z
        .object({
          result_id: z.string(),
          ready_for_close: z.boolean(),
          blockers: z.array(z.string()),
        })
        .passthrough(),
    ),
  })
  .passthrough();

const CloseSummarySchema = z
  .object({
    success: z.boolean(),
    business_close: z
      .object({
        success: z.boolean(),
      })
      .passthrough(),
    notification_close: z
      .object({
        success: z.boolean(),
      })
      .passthrough(),
    results: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

const CloseReadySchema = z
  .object({
    success: z.boolean(),
    ready_count: z.number(),
    skipped_count: z.number(),
    close_results: z.array(CloseSummarySchema),
  })
  .passthrough();

const RunSummarySchema = z
  .object({
    ready_to_report_complete: z.boolean().optional(),
    final_drain: z
      .object({
        ready_to_report_complete: z.boolean().optional(),
      })
      .passthrough()
      .optional(),
    blockers: z.array(z.unknown()).optional(),
    unfinished_records: z.array(z.unknown()).optional(),
  })
  .passthrough();

const RunReportSchema = z
  .object({
    success: z.boolean(),
    ready_to_report_complete: z.boolean(),
    ready_to_report_complete_reason: z.string(),
  })
  .passthrough();

export type BambooPreparedAgentData = z.infer<typeof PreparedDataSchema>;
export type BambooSopPublication = z.infer<typeof SopPublicationSchema>;
export type BambooModelValidation = z.infer<typeof ModelValidationSchema>;
export type BambooResultDirectoryValidation = z.infer<typeof ResultDirectoryValidationSchema>;
export type BambooCloseReadyResult = z.infer<typeof CloseReadySchema>;
export type BambooRunSummary = z.infer<typeof RunSummarySchema>;
export type BambooRunReport = z.infer<typeof RunReportSchema>;

export interface BambooAgentRunnerDependencies {
  resolveRunnerPath(): Promise<string>;
  run(
    executable: string,
    args: readonly string[],
    options: {
      cwd: string;
      env: NodeJS.ProcessEnv;
      timeout: number;
      maxBuffer: number;
    },
  ): Promise<{ stdout: string; stderr: string }>;
}

const defaultDependencies: BambooAgentRunnerDependencies = {
  resolveRunnerPath: resolveBambooAlertRunnerPath,
  run: async (executable, args, options) => {
    const result = await execFileAsync(executable, [...args], options);
    return { stdout: String(result.stdout ?? ""), stderr: String(result.stderr ?? "") };
  },
};

function commandErrorDetail(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String(error.stderr || "").trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}

async function runWithAudit<T>(input: {
  subcommand: string;
  args: readonly string[];
  outputFile: string;
  cwd: string;
  schema: z.ZodType<T>;
  dependencies: BambooAgentRunnerDependencies;
  env?: NodeJS.ProcessEnv;
}): Promise<T> {
  await mkdir(path.dirname(input.outputFile), { recursive: true });
  const runnerPath = await input.dependencies.resolveRunnerPath();
  try {
    await input.dependencies.run(
      process.execPath,
      [runnerPath, input.subcommand, ...input.args, "--output-file", input.outputFile],
      {
        cwd: input.cwd,
        env: input.env ?? process.env,
        timeout: RUNNER_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
      },
    );
  } catch (error) {
    throw new Error(`Bamboo runner ${input.subcommand} 执行失败：${commandErrorDetail(error)}`, {
      cause: error,
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(input.outputFile, "utf8"));
  } catch (error) {
    throw new Error(`Bamboo runner ${input.subcommand} 未生成有效审计文件`, { cause: error });
  }
  const parsed = input.schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Bamboo runner ${input.subcommand} 审计格式无效：${parsed.error.message}`);
  }
  return parsed.data;
}

export async function prepareBambooAgentData(
  input: {
    config: AlertTroubleshooterConfig;
    record: AlertTroubleshooterRecord;
    workspaceCwd: string;
    outputDirectory: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooPreparedAgentData> {
  const resultId = input.record.resultId?.trim();
  if (!resultId) throw new Error("Bamboo 排查记录缺少 result_id，无法准备 Agent 输入");
  const expectedRuleId = input.record.ruleId?.trim() || input.record.taskId?.trim();
  return runWithAudit({
    subcommand: "prepare-single-troubleshoot-data",
    args: [
      "--result-id",
      resultId,
      ...(input.record.bambooUrl?.trim() ? ["--bamboo-url", input.record.bambooUrl.trim()] : []),
      ...(expectedRuleId ? ["--expected-rule-id", expectedRuleId] : []),
      "--troubleshooting-sop-doc",
      input.config.troubleshootingSopDoc,
      "--output-dir",
      input.outputDirectory,
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: PreparedDataSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function publishBambooSopSummary(
  input: {
    config: AlertTroubleshooterConfig;
    record: AlertTroubleshooterRecord;
    workspaceCwd: string;
    ruleId: string;
    markdownFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooSopPublication> {
  const taskName = input.record.taskName?.trim() || `Bamboo result_id ${input.record.resultId}`;
  return runWithAudit({
    subcommand: "publish-sop-doc",
    args: [
      "--troubleshooting-sop-doc",
      input.config.troubleshootingSopDoc,
      "--rule-id",
      input.ruleId,
      "--task-name",
      taskName,
      "--markdown-file",
      input.markdownFile,
      "--tmp-dir",
      path.dirname(input.auditFile),
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: SopPublicationSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function validateBambooModelResult(
  input: {
    workspaceCwd: string;
    resultFile: string;
    workItemFile: string;
    markdownFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooModelValidation> {
  return runWithAudit({
    subcommand: "validate-model-result-json",
    args: [
      "--result-file",
      input.resultFile,
      "--work-item-file",
      input.workItemFile,
      "--doc-filled-file",
      input.markdownFile,
      "--no-strict",
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: ModelValidationSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function validateBambooResultDirectory(
  input: {
    workspaceCwd: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooResultDirectoryValidation> {
  return runWithAudit({
    subcommand: "validate-result-dir",
    args: ["--work-items-file", input.workItemsFile, "--result-dir", input.resultDirectory],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: ResultDirectoryValidationSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function closeBambooReadyWorkItem(
  input: {
    workspaceCwd: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooCloseReadyResult> {
  return runWithAudit({
    subcommand: "close-ready-work-items",
    args: ["--work-items-file", input.workItemsFile, "--result-dir", input.resultDirectory],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: CloseReadySchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function buildBambooRunSummary(
  input: {
    workspaceCwd: string;
    scanDirectoryUrl: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    dateKeys?: string[];
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooRunSummary> {
  return runWithAudit({
    subcommand: "auto-troubleshoot-drain",
    args: [
      "--scan-dir-url",
      input.scanDirectoryUrl,
      "--result-dir",
      input.resultDirectory,
      "--work-items-file",
      input.workItemsFile,
      ...(input.dateKeys ?? []).flatMap((dateKey) => ["--date-key", dateKey]),
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: RunSummarySchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function validateBambooFinalDrain(
  input: {
    workspaceCwd: string;
    scanDirectoryUrl: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    dateKeys?: string[];
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooRunSummary> {
  return runWithAudit({
    subcommand: "final-drain-check",
    args: [
      "--scan-dir-url",
      input.scanDirectoryUrl,
      "--result-dir",
      input.resultDirectory,
      "--work-items-file",
      input.workItemsFile,
      ...(input.dateKeys ?? []).flatMap((dateKey) => ["--date-key", dateKey]),
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: RunSummarySchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export async function renderBambooRunReport(
  input: {
    workspaceCwd: string;
    resultDirectory: string;
    runSummaryFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooAgentRunnerDependencies = defaultDependencies,
): Promise<BambooRunReport> {
  return runWithAudit({
    subcommand: "render-run-report",
    args: ["--run-summary-file", input.runSummaryFile, "--result-dir", input.resultDirectory],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: RunReportSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}
