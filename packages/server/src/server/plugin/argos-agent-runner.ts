import { execFile } from "node:child_process";
import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { promisify } from "node:util";
import { z } from "zod";
import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import { resolveCompatibleArgosRunnerPath } from "./argos-runner-contract.js";

const execFileAsync = promisify(execFile);
const RUNNER_TIMEOUT_MS = 15 * 60_000;

const PreparedDataSchema = z
  .object({
    success: z.boolean(),
    result_id: z.string().trim().min(1),
    input_file: z.string().trim().min(1),
    inspect_file: z.string().trim().min(1),
  })
  .passthrough();

const DocumentPublicationSchema = z
  .object({
    ai_result: z.string().trim().optional(),
    doc_token: z.string().trim().optional(),
    doc_archive_status: z.string().trim(),
    doc_archive_reason: z.string().trim().optional(),
    doc_write_status: z.string().trim().optional(),
  })
  .passthrough();

const SopPublicationSchema = z
  .object({
    total_sop_writeback_status: z.string().optional(),
    total_sop_writeback_reason: z.string().optional(),
    total_sop_doc_url: z.string().optional(),
    sop_writeback_status: z.string().optional(),
    sop_writeback_reason: z.string().optional(),
    sop_doc_url: z.string().optional(),
    sop_doc_token: z.string().optional(),
  })
  .passthrough();

const ResultReadinessSchema = z
  .object({
    ready_for_close: z.boolean(),
    blockers: z.array(z.string()),
  })
  .passthrough();

const ResultDirectoryValidationSchema = z
  .object({
    success: z.boolean(),
    total: z.number(),
    valid: z.number(),
    invalid: z.number(),
    results: z.array(z.record(z.string(), z.unknown())),
    per_result_close_readiness: z.record(z.string(), ResultReadinessSchema),
  })
  .passthrough();

const CloseReadySchema = z
  .object({
    success: z.boolean(),
    closed: z.number(),
    skipped: z.number(),
    results: z.array(z.record(z.string(), z.unknown())),
  })
  .passthrough();

const RunSummarySchema = z
  .object({
    ready_to_report_complete: z.boolean(),
    final_drain: z
      .object({
        ready_to_report_complete: z.boolean(),
      })
      .passthrough(),
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

export type ArgosPreparedAgentData = z.infer<typeof PreparedDataSchema>;
export type ArgosDocumentPublication = z.infer<typeof DocumentPublicationSchema>;
export type ArgosSopPublication = z.infer<typeof SopPublicationSchema>;
export type ArgosResultDirectoryValidation = z.infer<typeof ResultDirectoryValidationSchema>;
export type ArgosCloseReadyResult = z.infer<typeof CloseReadySchema>;
export type ArgosRunSummary = z.infer<typeof RunSummarySchema>;
export type ArgosRunReport = z.infer<typeof RunReportSchema>;

export interface ArgosAgentRunnerDependencies {
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

const defaultDependencies: ArgosAgentRunnerDependencies = {
  resolveRunnerPath: resolveCompatibleArgosRunnerPath,
  run: async (executable, args, options) => {
    const result = await execFileAsync(executable, [...args], options);
    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
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
  dependencies: ArgosAgentRunnerDependencies;
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
    throw new Error(`Argos Runner ${input.subcommand} 执行失败：${commandErrorDetail(error)}`, {
      cause: error,
    });
  }
  let raw: unknown;
  try {
    raw = JSON.parse(await readFile(input.outputFile, "utf8"));
  } catch (error) {
    throw new Error(`Argos Runner ${input.subcommand} 未生成有效审计文件`, {
      cause: error,
    });
  }
  const parsed = input.schema.safeParse(raw);
  if (!parsed.success) {
    throw new Error(`Argos Runner ${input.subcommand} 审计格式无效：${parsed.error.message}`);
  }
  return parsed.data;
}

export function prepareArgosAgentData(
  input: {
    config: AlertTroubleshooterConfig;
    workspaceCwd: string;
    workItemFile: string;
    outputDirectory: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosPreparedAgentData> {
  return runWithAudit({
    subcommand: "prepare-single-troubleshoot-data",
    args: [
      "--input-file",
      input.workItemFile,
      "--result-dir",
      input.outputDirectory,
      "--scan-dir-url",
      input.config.attributionRecordRoot,
      "--troubleshooting-sop-doc",
      input.config.troubleshootingSopDoc,
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: PreparedDataSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export function publishArgosDocument(
  input: {
    workspaceCwd: string;
    workItemFile: string;
    resultFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosDocumentPublication> {
  return runWithAudit({
    subcommand: "publish-troubleshooting-doc",
    args: ["--input-file", input.workItemFile, "--model-result-file", input.resultFile],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: DocumentPublicationSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export function publishArgosSop(
  input: {
    workspaceCwd: string;
    inputFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosSopPublication> {
  return runWithAudit({
    subcommand: "publish-sop-doc",
    args: ["--input-file", input.inputFile],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: SopPublicationSchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export function validateArgosResultDirectory(
  input: {
    workspaceCwd: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosResultDirectoryValidation> {
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

export function closeArgosReadyWorkItem(
  input: {
    workspaceCwd: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosCloseReadyResult> {
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

export function buildArgosRunSummary(
  input: {
    workspaceCwd: string;
    scanDirectoryUrl: string;
    resultDirectory: string;
    workItemsFile: string;
    auditFile: string;
    dateKeys: readonly string[];
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosRunSummary> {
  return runWithAudit({
    subcommand: "auto-troubleshoot-drain",
    args: [
      "--scan-dir-url",
      input.scanDirectoryUrl,
      "--result-dir",
      input.resultDirectory,
      "--work-items-file",
      input.workItemsFile,
      ...input.dateKeys.flatMap((dateKey) => ["--date-key", dateKey]),
    ],
    outputFile: input.auditFile,
    cwd: input.workspaceCwd,
    schema: RunSummarySchema,
    dependencies,
    env: input.commandEnvironment,
  });
}

export function renderArgosRunReport(
  input: {
    workspaceCwd: string;
    resultDirectory: string;
    runSummaryFile: string;
    auditFile: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: ArgosAgentRunnerDependencies = defaultDependencies,
): Promise<ArgosRunReport> {
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
