import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import { AlertTroubleshooterConfigSchema } from "@getpaseo/protocol/messages";
import {
  buildBambooRunSummary,
  closeBambooReadyWorkItem,
  prepareBambooAgentData,
  publishBambooSopSummary,
  renderBambooRunReport,
  validateBambooModelResult,
  validateBambooFinalDrain,
  validateBambooResultDirectory,
  type BambooAgentRunnerDependencies,
} from "./bamboo-agent-runner.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

function config() {
  return AlertTroubleshooterConfigSchema.parse({
    botId: "bot-1",
    chats: [{ chatId: "oc-1" }],
    target: { kind: "default" },
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/root",
  });
}

function record() {
  return {
    recordId: "rec-1",
    uniqueId: "19562663",
    resultId: "19562663",
    ruleId: "4086",
    taskName: "结算账户关系校验",
    taskTime: "2026-09-08T10:00:00.000Z",
    tableDate: "20260908",
    messageId: "om-1",
    chatId: "oc-1",
    chatName: "结算报警群",
    messageText: "Bamboo 对账报警",
    messageTime: "2026-09-08T10:00:00.000Z",
    trigger: "manual" as const,
  };
}

async function workspace(): Promise<string> {
  const cwd = await mkdtemp(path.join(tmpdir(), "paseo-bamboo-runner-"));
  temporaryDirectories.push(cwd);
  return cwd;
}

function runnerAuditPayload(subcommand: string): Record<string, unknown> {
  if (subcommand === "validate-model-result-json") {
    return { overallValid: true, overall_valid: true };
  }
  if (subcommand === "validate-result-dir") {
    return {
      success: true,
      close_ready: 1,
      close_blocked: 0,
      per_result_close_readiness: [{ result_id: "19562663", ready_for_close: true, blockers: [] }],
    };
  }
  if (subcommand === "close-ready-work-items") {
    return {
      success: true,
      ready_count: 1,
      skipped_count: 0,
      close_results: [
        {
          success: true,
          business_close: { success: true },
          notification_close: { success: true },
          results: [],
        },
      ],
    };
  }
  if (subcommand === "auto-troubleshoot-drain" || subcommand === "final-drain-check") {
    return {
      ready_to_report_complete: true,
      final_drain: { ready_to_report_complete: true },
    };
  }
  return {
    success: true,
    ready_to_report_complete: true,
    ready_to_report_complete_reason: "ready",
  };
}

describe("Bamboo agent runner", () => {
  it("prepares one result through the controlled runner", async () => {
    const cwd = await workspace();
    const outputDirectory = path.join(cwd, ".tmp", "prepared");
    const auditFile = path.join(outputDirectory, "prepare-result.json");
    const run = vi.fn<BambooAgentRunnerDependencies["run"]>(async (_executable, args) => {
      const outputFile = args[args.indexOf("--output-file") + 1];
      if (!outputFile) throw new Error("missing output file");
      await writeFile(
        outputFile,
        JSON.stringify({
          result_id: "19562663",
          rule_id: "rule-1",
          prepared_data_path: path.join(outputDirectory, "19562663-prepared-data.json"),
          work_item: { result_id: "19562663" },
        }),
        "utf8",
      );
      return { stdout: "{}", stderr: "" };
    });

    const commandEnvironment = {
      ...process.env,
      FEISHU_BOT_APP_ID: "cli_selected",
      FEISHU_BOT_APP_SECRET: "selected-secret",
    };
    const result = await prepareBambooAgentData(
      {
        config: config(),
        record: record(),
        workspaceCwd: cwd,
        outputDirectory,
        auditFile,
        commandEnvironment,
      },
      { resolveRunnerPath: async () => "/runner.mjs", run },
    );

    expect(result.result_id).toBe("19562663");
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      [
        "/runner.mjs",
        "prepare-single-troubleshoot-data",
        "--result-id",
        "19562663",
        "--expected-rule-id",
        "4086",
        "--troubleshooting-sop-doc",
        "https://example.com/wiki/sop",
        "--output-dir",
        outputDirectory,
        "--output-file",
        auditFile,
      ],
      expect.objectContaining({ cwd, env: commandEnvironment }),
    );
  });

  it("publishes the reviewed SOP file through code instead of an Agent", async () => {
    const cwd = await workspace();
    const markdownFile = path.join(cwd, ".tmp", "sop-summary.md");
    const auditFile = path.join(cwd, ".tmp", "publish-sop.json");
    await mkdir(path.dirname(markdownFile), { recursive: true });
    await writeFile(markdownFile, "# SOP\n\n排查步骤", "utf8");
    const run = vi.fn<BambooAgentRunnerDependencies["run"]>(async (_executable, args) => {
      const outputFile = args[args.indexOf("--output-file") + 1];
      if (!outputFile) throw new Error("missing output file");
      await writeFile(
        outputFile,
        JSON.stringify({
          success: true,
          sop_writeback_status: "succeeded",
          sop_doc_url: "https://example.com/wiki/rule-sop",
        }),
        "utf8",
      );
      return { stdout: "{}", stderr: "" };
    });

    const result = await publishBambooSopSummary(
      {
        config: config(),
        record: record(),
        workspaceCwd: cwd,
        ruleId: "rule-1",
        markdownFile,
        auditFile,
      },
      { resolveRunnerPath: async () => "/runner.mjs", run },
    );

    expect(result.sop_writeback_status).toBe("succeeded");
    expect(run).toHaveBeenCalledWith(
      process.execPath,
      expect.arrayContaining([
        "publish-sop-doc",
        "--rule-id",
        "rule-1",
        "--markdown-file",
        markdownFile,
      ]),
      expect.objectContaining({ cwd }),
    );
  });

  it("validates, closes, drains, and renders through audited runner commands", async () => {
    const cwd = await workspace();
    const resultDirectory = path.join(cwd, ".tmp", "bamboo-run");
    await mkdir(resultDirectory, { recursive: true });
    const resultFile = path.join(resultDirectory, "19562663.json");
    const workItemFile = path.join(resultDirectory, "work-item-19562663.json");
    const workItemsFile = path.join(resultDirectory, "work-items.json");
    const markdownFile = path.join(resultDirectory, "19562663.md");
    await Promise.all([
      writeFile(resultFile, "{}", "utf8"),
      writeFile(workItemFile, "{}", "utf8"),
      writeFile(workItemsFile, "[]", "utf8"),
      writeFile(markdownFile, "# 排查结果", "utf8"),
    ]);
    const subcommands: string[] = [];
    const run = vi.fn<BambooAgentRunnerDependencies["run"]>(async (_executable, args) => {
      const subcommand = args[1] ?? "";
      subcommands.push(subcommand);
      const outputFile = args[args.indexOf("--output-file") + 1];
      if (!outputFile) throw new Error("missing output file");
      const output = runnerAuditPayload(subcommand);
      await writeFile(outputFile, JSON.stringify(output), "utf8");
      return { stdout: "{}", stderr: "" };
    });
    const dependencies = { resolveRunnerPath: async () => "/runner.mjs", run };

    await validateBambooModelResult(
      {
        workspaceCwd: cwd,
        resultFile,
        workItemFile,
        markdownFile,
        auditFile: path.join(resultDirectory, "validate-model.json"),
      },
      dependencies,
    );
    await validateBambooResultDirectory(
      {
        workspaceCwd: cwd,
        resultDirectory,
        workItemsFile,
        auditFile: path.join(resultDirectory, "validate-dir.json"),
      },
      dependencies,
    );
    await closeBambooReadyWorkItem(
      {
        workspaceCwd: cwd,
        resultDirectory,
        workItemsFile,
        auditFile: path.join(resultDirectory, "close-ready.json"),
      },
      dependencies,
    );
    await buildBambooRunSummary(
      {
        workspaceCwd: cwd,
        scanDirectoryUrl: "https://example.com/wiki/root",
        resultDirectory,
        workItemsFile,
        auditFile: path.join(resultDirectory, "run-summary.json"),
      },
      dependencies,
    );
    await validateBambooFinalDrain(
      {
        workspaceCwd: cwd,
        scanDirectoryUrl: "https://example.com/wiki/root",
        resultDirectory,
        workItemsFile,
        auditFile: path.join(resultDirectory, "final-drain-check.json"),
      },
      dependencies,
    );
    await renderBambooRunReport(
      {
        workspaceCwd: cwd,
        resultDirectory,
        runSummaryFile: path.join(resultDirectory, "run-summary.json"),
        auditFile: path.join(resultDirectory, "run-report.json"),
      },
      dependencies,
    );

    expect(subcommands).toEqual([
      "validate-model-result-json",
      "validate-result-dir",
      "close-ready-work-items",
      "auto-troubleshoot-drain",
      "final-drain-check",
      "render-run-report",
    ]);
  });
});
