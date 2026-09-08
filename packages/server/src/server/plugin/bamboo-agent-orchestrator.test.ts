import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertTroubleshooterConfig, PluginAppState } from "@getpaseo/protocol/messages";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import type { AlertTroubleshooterRecordExecutionInput } from "./alert-troubleshooter-agent-execution.js";
import {
  bambooAgentArtifactPaths,
  writeBambooAgentJsonAtomic,
} from "./bamboo-agent-artifact-store.js";
import {
  executeBambooAgentPipeline,
  type BambooAgentOrchestratorDependencies,
} from "./bamboo-agent-orchestrator.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

const CONFIG: AlertTroubleshooterConfig = {
  version: 4,
  enabled: true,
  listenEnabled: true,
  troubleshootingEnabled: true,
  botId: "bot-1",
  chats: [{ chatId: "oc_alerts", name: "结算报警群" }],
  target: { kind: "default" },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  attributionRecordRoot: "https://example.com/wiki/records",
  promptTemplate: "",
  queuePollIntervalMinutes: 5,
  schedule: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 0,
  },
};

const PROJECT: PersistedProjectRecord = {
  projectId: "prj_1",
  rootPath: "/tmp/project",
  kind: "non_git",
  displayName: "结算项目",
  projectKey: null,
  customName: null,
  customIconRevision: null,
  parentProjectId: null,
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
  archivedAt: null,
};

const STATE: PluginAppState = {
  pluginId: "bamboo-reconciliation-troubleshooter",
  appId: "bamboo-troubleshooter-console",
  projectId: "prj_1",
  defaultAgent: { provider: "codex", model: "gpt-5.6" },
  knowledge: "",
  data: {},
  document: null,
  conversation: [],
  createdAt: "2026-09-08T00:00:00.000Z",
  updatedAt: "2026-09-08T00:00:00.000Z",
};

async function createHarness(reviewPassed = true) {
  const workspaceCwd = await mkdtemp(path.join(tmpdir(), "paseo-bamboo-agent-pipeline-"));
  temporaryDirectories.push(workspaceCwd);
  const item = {
    id: "queue-1",
    recordId: "rec-1",
    uniqueId: "19562663",
    resultId: "19562663",
    tableDate: "20260908",
    messageId: "om-1",
    trigger: "manual" as const,
    status: "running" as const,
    matchedCount: 1,
    attempts: 1,
    queuedAt: "2026-09-08T00:00:00.000Z",
    updatedAt: "2026-09-08T00:00:00.000Z",
    nextRetryAt: null,
    agentId: null,
    error: null,
  };
  const paths = bambooAgentArtifactPaths({
    workspaceCwd,
    resultId: "19562663",
    queueItemId: item.id,
    attempt: item.attempts,
  });
  const stages: string[] = [];
  const prompts: string[] = [];
  const launchAgent: AlertTroubleshooterRecordExecutionInput["launchAgent"] = vi.fn(
    async (stage) => {
      stages.push(`agent:${stage.stage}`);
      prompts.push(stage.prompt);
      if (stage.stage === "investigation") {
        await writeBambooAgentJsonAtomic(paths.investigationResult, {
          version: 1,
          result_id: "19562663",
          status: "succeeded",
          summary: "异常由上游账单状态延迟导致",
          attribution_result: "[业务问题]上游账单状态延迟",
          rule_id: "rule-1",
          writeback_owner: "parent_orchestrator",
        });
        await writeFile(
          paths.investigationReport,
          "# 排查结果\n\n## 结论\n上游账单状态延迟，已核对异常样本与日志证据。\n",
          "utf8",
        );
        await writeFile(
          paths.ruleSopDraft,
          "# 规则 SOP 草稿\n\n先核对规则 SQL，再按账单 ID 查询状态和日志。\n",
          "utf8",
        );
      } else if (stage.stage === "sop_summary") {
        await writeBambooAgentJsonAtomic(paths.sopSummaryResult, {
          version: 1,
          result_id: "19562663",
          status: "ready",
          summary: "补充账单状态延迟排查步骤",
          rule_id: "rule-1",
        });
        await writeFile(
          paths.sopSummaryMarkdown,
          "# rule-1 排查 SOP\n\n## 步骤\n按账单 ID 核对状态、日志和异常样本。\n",
          "utf8",
        );
      } else if (stage.stage === "review") {
        const reviewInput = JSON.parse(await readFile(paths.reviewInput, "utf8")) as {
          checked_files: string[];
        };
        expect(reviewInput.checked_files).toEqual(
          expect.arrayContaining([
            paths.investigationResult,
            paths.publishDocumentAudit,
            paths.publishSopAudit,
            paths.modelValidationAudit,
          ]),
        );
        await writeBambooAgentJsonAtomic(paths.reviewResult, {
          review_passed: reviewPassed,
          blockers: reviewPassed ? [] : ["缺少关键 RPC 证据"],
          required_rework_prompt: reviewPassed ? "" : "补充账单状态 RPC 查询结果。",
          checked_files: reviewInput.checked_files,
          validation_command: "paseo:bamboo-agent-artifact-validator@v1",
          review_summary: reviewPassed ? "证据完整，可以发布" : "证据不足，禁止发布",
        });
      }
      return { agentId: `agent-${stage.stage}`, lastMessage: '{"status":"completed"}' };
    },
  );
  const events: string[] = [];
  const dependencies: BambooAgentOrchestratorDependencies = {
    prepareAgentData: async (input) => {
      events.push("code:prepare");
      await writeBambooAgentJsonAtomic(input.auditFile, {
        result_id: "19562663",
        rule_id: "rule-1",
        work_item: { result_id: "19562663", rule_id: "rule-1" },
      });
      return {
        result_id: "19562663",
        rule_id: "rule-1",
        work_item: { result_id: "19562663", rule_id: "rule-1" },
      };
    },
    publishDocument: vi.fn(async ({ markdownFile }) => {
      events.push("code:publish-document");
      expect(markdownFile).toBe(paths.investigationReport);
      await writeBambooAgentJsonAtomic(paths.publishDocumentAudit, {
        success: true,
        feishu_doc_url: "https://example.com/wiki/result",
        doc_archive_status: "succeeded",
        parent_wiki_token: "wikcn-parent",
        target_space_id: "space-1",
        mergedMarkdown: "# 排查结果\n\n## 结论\n上游账单状态延迟，已核对异常样本与日志证据。\n",
      });
      return {
        documentUrl: "https://example.com/wiki/result",
        markdownFile: markdownFile ?? "",
        auditFile: paths.publishDocumentAudit,
        documentToken: "doc-token",
        writeStatus: "updated",
      };
    }),
    publishSop: vi.fn(async ({ markdownFile, auditFile }) => {
      events.push("code:publish-sop");
      expect(markdownFile).toBe(paths.sopSummaryMarkdown);
      const result = {
        success: true,
        sop_writeback_status: "succeeded" as const,
        sop_doc_url: "https://example.com/wiki/rule-sop",
      };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    }),
    validateModelResult: vi.fn(async ({ auditFile }) => {
      events.push("code:validate-model");
      const result = { overallValid: true, overall_valid: true };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    }),
    validateResultDirectory: vi.fn(async ({ auditFile }) => {
      events.push("code:validate-result-dir");
      const result = {
        success: true,
        close_ready: 1,
        close_blocked: 0,
        per_result_close_readiness: [
          { result_id: "19562663", ready_for_close: true, blockers: [] },
        ],
      };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    }),
    closeReadyWorkItem: vi.fn(async ({ auditFile }) => {
      events.push("code:close");
      const result = {
        success: true,
        ready_count: 1,
        skipped_count: 0,
        close_results: [
          {
            success: true,
            business_close: { success: true },
            notification_close: { success: true },
            results: [{ result_id: "19562663", status: "succeeded" }],
          },
        ],
      };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    }),
    buildRunSummary: vi.fn(async ({ auditFile }) => {
      events.push("code:drain");
      const result = {
        ready_to_report_complete: true,
        final_drain: { ready_to_report_complete: true },
      };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    }),
    renderRunReport: vi.fn(async ({ auditFile }) => {
      events.push("code:report");
      const result = {
        success: true,
        ready_to_report_complete: true,
        ready_to_report_complete_reason: "ready",
      };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    }),
  };
  const input: AlertTroubleshooterRecordExecutionInput = {
    config: CONFIG,
    state: STATE,
    project: PROJECT,
    record: {
      recordId: "rec-1",
      uniqueId: "19562663",
      resultId: "19562663",
      taskName: "结算对账规则",
      taskTime: "2026-09-08T00:00:00.000Z",
      tableDate: "20260908",
      messageId: "om-1",
      chatId: "oc_alerts",
      chatName: "结算报警群",
      messageText: "Bamboo 报警",
      messageTime: "2026-09-08T00:00:00.000Z",
      trigger: "manual",
    },
    item,
    workspace: { workspaceId: "ws-1", cwd: workspaceCwd },
    wikiTarget: { spaceId: "space-1", parentNodeToken: "wikcn-parent" },
    closeContext: {
      baseToken: "base-token",
      tableId: "table-id",
      parentWikiToken: "wikcn-parent",
      targetSpaceId: "space-1",
    },
    prompt: "只排查当前 result_id。",
    launchAgent: async (stage) => {
      const result = await launchAgent(stage);
      events.push(`finished:${stage.stage}`);
      return result;
    },
  };
  return { dependencies, events, input, launchAgent, paths, prompts, stages };
}

describe("executeBambooAgentPipeline", () => {
  it("uses three fresh agents, reviews final audits, and closes through the runner", async () => {
    const harness = await createHarness();

    const result = await executeBambooAgentPipeline(harness.input, harness.dependencies);

    expect(harness.stages).toEqual(["agent:investigation", "agent:sop_summary", "agent:review"]);
    expect(harness.prompts[1]).not.toContain("异常由上游账单状态延迟导致");
    expect(harness.prompts[2]).not.toContain("异常由上游账单状态延迟导致");
    expect(
      (harness.launchAgent as ReturnType<typeof vi.fn>).mock.results.map((entry) => entry.type),
    ).toEqual(["return", "return", "return"]);
    expect(harness.events).toEqual([
      "code:prepare",
      "finished:investigation",
      "finished:sop_summary",
      "code:publish-document",
      "code:publish-sop",
      "code:validate-model",
      "finished:review",
      "code:validate-result-dir",
      "code:close",
      "code:drain",
      "code:report",
    ]);
    expect(result).toEqual({
      agentId: "agent-investigation",
      completion: {
        status: "succeeded",
        summary: "异常由上游账单状态延迟导致",
        documentUrl: "https://example.com/wiki/result",
      },
      persistenceHandled: true,
    });
    expect(await readFile(harness.paths.runInput, "utf8")).toContain(
      '"writeback_owner": "parent_orchestrator"',
    );
  });

  it("blocks close after final publication when the independent review fails", async () => {
    const harness = await createHarness(false);

    await expect(executeBambooAgentPipeline(harness.input, harness.dependencies)).rejects.toThrow(
      "返工要求：补充账单状态 RPC 查询结果",
    );

    expect(harness.dependencies.publishDocument).toHaveBeenCalledOnce();
    expect(harness.dependencies.publishSop).toHaveBeenCalledOnce();
    expect(harness.dependencies.closeReadyWorkItem).not.toHaveBeenCalled();
  });

  it("keeps a notification failure visible after the business close succeeds", async () => {
    const harness = await createHarness();
    harness.dependencies.closeReadyWorkItem = vi.fn(async ({ auditFile }) => {
      const result = {
        success: true,
        ready_count: 1,
        skipped_count: 0,
        close_results: [
          {
            success: false,
            business_close: { success: true },
            notification_close: {
              success: false,
              failed_card_updates: 1,
              partial_failed: true,
            },
            results: [{ result_id: "19562663", status: "succeeded" }],
          },
        ],
      };
      await writeBambooAgentJsonAtomic(auditFile, result);
      return result;
    });

    const result = await executeBambooAgentPipeline(harness.input, harness.dependencies);

    expect(result.persistenceHandled).toBe(true);
    expect(result.completionWarning).toContain("通知回写部分失败");
  });
});
