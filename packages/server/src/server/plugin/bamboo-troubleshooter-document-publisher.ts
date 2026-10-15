import { mkdir, readFile } from "node:fs/promises";
import path from "node:path";
import { execCommand } from "../../utils/spawn.js";
import { z } from "zod";
import type { AlertTroubleshooterConfig } from "@getpaseo/protocol/messages";
import type { AlertTroubleshooterRecord } from "./alert-troubleshooter-record-store.js";
import { resolveCompatibleBambooRunnerPath } from "./bamboo-runner-contract.js";

const RUNNER_TIMEOUT_MS = 15 * 60_000;

const PublishResultSchema = z.object({
  success: z.boolean(),
  feishu_doc_url: z.string().optional(),
  doc_token: z.string().optional(),
  doc_write_status: z.string().optional(),
  doc_archive_status: z.string().optional(),
  doc_archive_reason: z.string().optional(),
  parent_wiki_token: z.string().optional(),
  target_space_id: z.string().optional(),
});

export interface BambooTroubleshooterWikiTarget {
  spaceId: string;
  parentNodeToken: string;
}

export interface BambooTroubleshooterDocumentPublication {
  documentUrl: string;
  markdownFile: string;
  auditFile: string;
  documentToken?: string;
  writeStatus?: string;
  archiveReason?: string;
}

export interface BambooTroubleshooterPublisherDependencies {
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

export async function resolveBambooAlertRunnerPath(): Promise<string> {
  return resolveCompatibleBambooRunnerPath();
}

async function findMarkdownFile(cwd: string, resultId: string): Promise<string> {
  const candidates = [
    path.join(cwd, ".tmp", `bamboo-single-${resultId}`, "fresh", `${resultId}-troubleshooting.md`),
    path.join(cwd, ".tmp", `bamboo-single-${resultId}`, `${resultId}-troubleshooting-fresh.md`),
    path.join(cwd, ".tmp", `${resultId}-troubleshooting.md`),
    path.join(cwd, ".tmp", `bamboo-single-${resultId}`, `${resultId}-troubleshooting.md`),
    path.join(cwd, ".tmp", `bamboo-single-${resultId}`, `${resultId}.md`),
    path.join(cwd, ".tmp", `${resultId}.md`),
  ];
  for (const candidate of candidates) {
    try {
      const markdown = await readFile(candidate, "utf8");
      if (markdown.trim()) return candidate;
    } catch {
      // Try the next supported agent output location.
    }
  }
  throw new Error(
    `排查 Agent 已结束，但未生成 result_id=${resultId} 的本地 Markdown，无法确定性发布 Wiki 文档`,
  );
}

const defaultDependencies: BambooTroubleshooterPublisherDependencies = {
  resolveRunnerPath: resolveBambooAlertRunnerPath,
  run: async (executable, args, options) => {
    const result = await execCommand(executable, [...args], options);
    return {
      stdout: String(result.stdout ?? ""),
      stderr: String(result.stderr ?? ""),
    };
  },
};

function resolveTaskName(record: AlertTroubleshooterRecord, resultId: string): string {
  return record.taskName?.trim() || `Bamboo result_id ${resultId}`;
}

function resolveTaskTime(record: AlertTroubleshooterRecord): string {
  return record.taskTime?.trim() || record.messageTime?.trim() || new Date().toISOString();
}

function commandErrorDetail(error: unknown): string {
  if (error && typeof error === "object" && "stderr" in error) {
    const stderr = String(error.stderr || "").trim();
    if (stderr) return stderr;
  }
  return error instanceof Error ? error.message : String(error);
}

async function runPublisherCommand(input: {
  dependencies: BambooTroubleshooterPublisherDependencies;
  runnerPath: string;
  resultId: string;
  taskName: string;
  taskTime: string;
  markdownFile: string;
  troubleshootingSopDoc: string;
  wikiTarget: BambooTroubleshooterWikiTarget;
  auditFile: string;
  workspaceCwd: string;
  commandEnvironment?: NodeJS.ProcessEnv;
}): Promise<void> {
  try {
    await input.dependencies.run(
      process.execPath,
      [
        input.runnerPath,
        "publish-troubleshooting-doc",
        "--result-id",
        input.resultId,
        "--task-name",
        input.taskName,
        "--task-time",
        input.taskTime,
        "--markdown-file",
        input.markdownFile,
        "--troubleshooting-sop-doc",
        input.troubleshootingSopDoc,
        "--parent-wiki-token",
        input.wikiTarget.parentNodeToken,
        "--target-space-id",
        input.wikiTarget.spaceId,
        "--output-file",
        input.auditFile,
      ],
      {
        cwd: input.workspaceCwd,
        env: input.commandEnvironment ?? process.env,
        timeout: RUNNER_TIMEOUT_MS,
        maxBuffer: 20 * 1024 * 1024,
      },
    );
  } catch (error) {
    throw new Error(`发布 Bamboo 排查 Wiki 文档失败：${commandErrorDetail(error)}`, {
      cause: error,
    });
  }
}

async function readPublishResult(auditFile: string): Promise<z.infer<typeof PublishResultSchema>> {
  let rawResult: unknown;
  try {
    rawResult = JSON.parse(await readFile(auditFile, "utf8"));
  } catch (error) {
    throw new Error(
      `Bamboo 排查文档发布命令未生成有效终态审计文件：${
        error instanceof Error ? error.message : String(error)
      }`,
      { cause: error },
    );
  }
  const parsed = PublishResultSchema.safeParse(rawResult);
  if (!parsed.success) {
    throw new Error("Bamboo 排查文档发布终态格式无效");
  }
  return parsed.data;
}

function validatePublishResult(
  result: z.infer<typeof PublishResultSchema>,
  wikiTarget: BambooTroubleshooterWikiTarget,
): string {
  if (!result.success || result.doc_archive_status !== "succeeded") {
    throw new Error(
      `Bamboo 排查文档未成功归档：${result.doc_archive_reason?.trim() || "runner 未返回成功终态"}`,
    );
  }
  if (result.parent_wiki_token !== wikiTarget.parentNodeToken) {
    throw new Error("Bamboo 排查文档归档父节点与当前日报 Base 节点不一致");
  }
  if (result.target_space_id !== wikiTarget.spaceId) {
    throw new Error("Bamboo 排查文档归档知识空间与当前日报 Base 不一致");
  }
  const documentUrl = result.feishu_doc_url?.trim() ?? "";
  if (!documentUrl.includes("/wiki/")) {
    throw new Error("Bamboo 排查文档发布成功但未返回 Wiki 链接");
  }
  return documentUrl;
}

export async function publishBambooTroubleshooterDocument(
  input: {
    config: AlertTroubleshooterConfig;
    record: AlertTroubleshooterRecord;
    workspaceCwd: string;
    wikiTarget: BambooTroubleshooterWikiTarget;
    markdownFile?: string;
    auditFile?: string;
    commandEnvironment?: NodeJS.ProcessEnv;
  },
  dependencies: BambooTroubleshooterPublisherDependencies = defaultDependencies,
): Promise<BambooTroubleshooterDocumentPublication> {
  const resultId = input.record.resultId?.trim();
  if (!resultId) {
    throw new Error("Bamboo 排查记录缺少 result_id，无法发布排查文档");
  }
  const markdownFile = input.markdownFile ?? (await findMarkdownFile(input.workspaceCwd, resultId));
  const auditFile =
    input.auditFile ??
    path.join(
      input.workspaceCwd,
      ".tmp",
      `bamboo-single-${resultId}`,
      `publish-doc-${resultId}.json`,
    );
  const auditDirectory = path.dirname(auditFile);
  await mkdir(auditDirectory, { recursive: true });

  const runnerPath = await dependencies.resolveRunnerPath();
  await runPublisherCommand({
    dependencies,
    runnerPath,
    resultId,
    taskName: resolveTaskName(input.record, resultId),
    taskTime: resolveTaskTime(input.record),
    markdownFile,
    troubleshootingSopDoc: input.config.troubleshootingSopDoc,
    wikiTarget: input.wikiTarget,
    auditFile,
    workspaceCwd: input.workspaceCwd,
    commandEnvironment: input.commandEnvironment,
  });
  const result = await readPublishResult(auditFile);
  const documentUrl = validatePublishResult(result, input.wikiTarget);
  return {
    documentUrl,
    markdownFile,
    auditFile,
    ...(result.doc_token ? { documentToken: result.doc_token } : {}),
    ...(result.doc_write_status ? { writeStatus: result.doc_write_status } : {}),
    ...(result.doc_archive_reason ? { archiveReason: result.doc_archive_reason } : {}),
  };
}
