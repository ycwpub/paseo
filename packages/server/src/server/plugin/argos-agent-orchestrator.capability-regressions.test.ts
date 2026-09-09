import { mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it, vi } from "vitest";
import type { AlertTroubleshooterConfig, PluginAppState } from "@getpaseo/protocol/messages";
import type { PersistedProjectRecord } from "../workspace-registry.js";
import type { AlertTroubleshooterRecordExecutionInput } from "./alert-troubleshooter-agent-execution.js";
import { argosAgentArtifactPaths, writeArgosJsonAtomic } from "./argos-agent-artifact-store.js";
import {
  executeArgosAgentPipeline,
  type ArgosAgentOrchestratorDependencies,
} from "./argos-agent-orchestrator.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

const CONFIG: AlertTroubleshooterConfig = {
  version: 4,
  enabled: true,
  listenEnabled: true,
  troubleshootingEnabled: true,
  autoArchiveAgents: false,
  botId: "bot-1",
  bot: { kind: "existing", botId: "bot-1" },
  chats: [{ chatId: "oc_alerts", name: "Argos 报警群" }],
  target: { kind: "default" },
  troubleshootingSopDoc: "https://example.com/wiki/sop",
  troubleshootingSkills: [],
  referenceFeishuDocs: [],
  attributionRecordRoot: "https://example.com/wiki/records",
  promptTemplate: "",
  queuePollIntervalMinutes: 5,
  dateLookbackDays: 2,
  schedule: {
    enabled: true,
    intervalMinutes: 30,
    lookbackMinutes: 120,
    excludeRecentMinutes: 0,
  },
};

const STATE: PluginAppState = {
  pluginId: "argos-alert-troubleshooter",
  appId: "argos-troubleshooter-console",
  projectId: "prj-1",
  defaultAgent: { provider: "codex", model: "gpt-5.6" },
  knowledge: "",
  data: {},
  document: null,
  conversation: [],
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
};

const PROJECT: PersistedProjectRecord = {
  projectId: "prj-1",
  rootPath: "/tmp/project",
  kind: "non_git",
  displayName: "结算项目",
  projectKey: null,
  customName: null,
  customIconRevision: null,
  parentProjectId: null,
  createdAt: "2026-09-09T00:00:00.000Z",
  updatedAt: "2026-09-09T00:00:00.000Z",
  archivedAt: null,
};

async function harness(reviewPasses: readonly boolean[] = [true]) {
  const cwd = await mkdtemp(path.join(tmpdir(), "paseo-argos-orchestrator-"));
  directories.push(cwd);
  const item = {
    id: "queue-1",
    recordId: "rec-1",
    uniqueId: "rule-42",
    resultId: "alert-99",
    tableDate: "20260909",
    messageId: "om-1",
    trigger: "manual" as const,
    status: "running" as const,
    matchedCount: 1,
    attempts: 1,
    queuedAt: "2026-09-09T00:00:00.000Z",
    updatedAt: "2026-09-09T00:00:00.000Z",
    nextRetryAt: null,
    agentId: null,
    error: null,
  };
  const paths = argosAgentArtifactPaths({
    workspaceCwd: cwd,
    resultId: "alert-99",
    queueItemId: item.id,
    attempt: item.attempts,
  });
  const stages: string[] = [];
  let reviewRound = 0;
  const writeInvestigation = async () => {
    await writeArgosJsonAtomic(paths.investigationResult, {
      version: 1,
      result_id: "alert-99",
      status: "succeeded",
      summary: "消费积压由下游依赖异常导致",
      attribution_result: "[有效告警]下游依赖异常",
      rule_id: "rule-42",
      rule_name: "消费积压",
      psm: "life.settle.demo",
      confidence: 0.9,
      evidence_items: [
        {
          category: "argos_rca",
          source: "Argos RCA",
          summary: "下游错误率升高",
        },
        { category: "dependency", source: "依赖日志", summary: "依赖超时" },
      ],
      writeback_owner: "parent_orchestrator",
    });
    await writeFile(
      paths.investigationReport,
      "# 排查结果\n\n已核对报警窗口、指标、依赖日志和历史结论。\n",
      "utf8",
    );
    await writeFile(paths.ruleSopDraft, "# 规则 SOP\n\n核对消费积压和下游错误率。\n", "utf8");
  };
  const launchAgent: AlertTroubleshooterRecordExecutionInput["launchAgent"] = vi.fn(
    async (stage) => {
      stages.push(stage.stage);
      if (stage.stage === "investigation") await writeInvestigation();
      if (stage.stage === "sop_summary") {
        await writeArgosJsonAtomic(paths.sopSummaryResult, {
          version: 1,
          result_id: "alert-99",
          status: "ready",
          summary: "已提炼通用和规则 SOP",
          rule_id: "rule-42",
        });
        await writeFile(paths.totalSopMarkdown, "# Argos 通用 SOP\n\n先核对指标和 RCA。\n");
        await writeFile(paths.ruleSopMarkdown, "# rule-42 SOP\n\n核对下游依赖。\n");
      }
      if (stage.stage === "review") {
        const passed = reviewPasses[Math.min(reviewRound, reviewPasses.length - 1)] ?? false;
        reviewRound += 1;
        const reviewInput = JSON.parse(await readFile(paths.reviewInput, "utf8")) as {
          checked_files: string[];
        };
        await writeArgosJsonAtomic(paths.reviewResult, {
          review_passed: passed,
          blockers: passed ? [] : ["缺少 trace 证据"],
          required_rework_prompt: passed ? "" : "补充 trace 查询。",
          checked_files: reviewInput.checked_files,
          validation_command: "argos validate-result-dir",
          review_summary: passed ? "通过" : "需返工",
        });
      }
      return { agentId: `agent-${stage.stage}`, lastMessage: null };
    },
  );
  const dependencies: ArgosAgentOrchestratorDependencies = {
    prepareAgentData: vi.fn(async ({ auditFile }) => {
      const prepared = {
        success: true,
        result_id: "alert-99",
        input_file: path.join(paths.preparedDirectory, "single-input-alert-99.json"),
        inspect_file: path.join(paths.preparedDirectory, "inspect-alert-99.json"),
      };
      await writeArgosJsonAtomic(auditFile, prepared);
      return prepared;
    }),
    publishDocument: vi.fn(async ({ auditFile }) => {
      const result = {
        ai_result: "https://example.com/wiki/result",
        doc_token: "doc-1",
        doc_archive_status: "created",
        doc_write_status: "created",
      };
      await writeArgosJsonAtomic(auditFile, result);
      return result;
    }),
    publishSop: vi.fn(async ({ inputFile, auditFile }) => {
      const payload = JSON.parse(await readFile(inputFile, "utf8")) as {
        type: string;
      };
      const result =
        payload.type === "total"
          ? {
              total_sop_writeback_status: "succeeded",
              total_sop_doc_url: CONFIG.troubleshootingSopDoc,
            }
          : {
              sop_writeback_status: "succeeded",
              sop_doc_url: "https://example.com/wiki/rule-sop",
            };
      await writeArgosJsonAtomic(auditFile, result);
      return result;
    }),
    validateResultDirectory: vi.fn(async ({ auditFile }) => {
      const review = await readFile(paths.reviewResult, "utf8")
        .then((value) => JSON.parse(value) as { review_passed?: boolean })
        .catch(() => null);
      const ready = review?.review_passed === true;
      const result = {
        success: ready,
        total: 1,
        valid: ready ? 1 : 0,
        invalid: ready ? 0 : 1,
        results: [],
        per_result_close_readiness: {
          "alert-99": {
            ready_for_close: ready,
            blockers: ready ? [] : ["missing_review_audit"],
          },
        },
      };
      await writeArgosJsonAtomic(auditFile, result);
      return result;
    }),
    closeReadyWorkItem: vi.fn(async ({ auditFile }) => {
      const result = {
        success: true,
        closed: 1,
        skipped: 0,
        results: [
          {
            result_id: "alert-99",
            status: "succeeded",
            doc_archive_status: "updated",
            sop_writeback_status: "succeeded",
            card_update_status: "skipped",
            message_reply_status: "succeeded",
          },
        ],
      };
      await writeArgosJsonAtomic(auditFile, result);
      return result;
    }),
    buildRunSummary: vi.fn(async ({ auditFile }) => {
      const result = {
        ready_to_report_complete: true,
        final_drain: { ready_to_report_complete: true },
      };
      await writeArgosJsonAtomic(auditFile, result);
      return result;
    }),
    renderRunReport: vi.fn(async ({ auditFile }) => {
      const result = {
        success: true,
        ready_to_report_complete: true,
        ready_to_report_complete_reason: "ready",
      };
      await writeArgosJsonAtomic(auditFile, result);
      return result;
    }),
  };
  const input: AlertTroubleshooterRecordExecutionInput = {
    config: CONFIG,
    state: STATE,
    project: PROJECT,
    record: {
      recordId: "rec-1",
      uniqueId: "rule-42",
      resultId: "alert-99",
      ruleId: "rule-42",
      taskName: "消费积压",
      taskTime: "2026-09-09T08:00:00.000Z",
      extra: {
        psm: "life.settle.demo",
        level: "critical",
        result_url: "https://cloud.bytedance.net/argos/alarm/detail/event/rule-42/alert-99",
      },
      tableDate: "20260909",
      messageId: "om-1",
      chatId: "oc-alerts",
      chatName: "Argos 报警群",
      messageText: "Argos critical 告警",
      messageTime: "2026-09-09T08:00:00.000Z",
      trigger: "manual",
    },
    item,
    workspace: { workspaceId: "ws-1", cwd },
    wikiTarget: { spaceId: "space-1", parentNodeToken: "wiki-parent" },
    closeContext: {
      baseToken: "base-1",
      tableId: "table-1",
      parentWikiToken: "wiki-parent",
      targetSpaceId: "space-1",
    },
    prompt: "只处理当前 Argos 报警。",
    launchAgent,
    continueAgent: async (agentId) => {
      await writeInvestigation();
      return { agentId, lastMessage: null };
    },
  };
  return { dependencies, input, paths, stages, launchAgent };
}

describe("executeArgosAgentPipeline", () => {
  it("uses independent investigation, SOP and review agents before controlled close", async () => {
    const context = await harness();

    const result = await executeArgosAgentPipeline(context.input, context.dependencies);

    expect(context.stages).toEqual(["investigation", "sop_summary", "review"]);
    expect(result).toMatchObject({
      agentId: "agent-investigation",
      completion: {
        status: "succeeded",
        summary: "消费积压由下游依赖异常导致",
        documentUrl: "https://example.com/wiki/result",
      },
      persistenceHandled: true,
      report: { readyToReportComplete: true },
    });
    expect(context.dependencies.closeReadyWorkItem).toHaveBeenCalledOnce();
    const workItem = await readFile(context.paths.workItem, "utf8");
    expect(workItem).toContain('"result_id": "alert-99"');
    expect(workItem).not.toContain('"writeback_owner"');
    await expect(readFile(context.paths.runInput, "utf8")).resolves.toContain(
      '"writeback_owner": "parent_orchestrator"',
    );
  });

  it("returns failed review requirements to the original investigation agent", async () => {
    const context = await harness([false, true]);
    const continueAgent = vi.spyOn(context.input, "continueAgent");

    await expect(
      executeArgosAgentPipeline(context.input, context.dependencies),
    ).resolves.toMatchObject({ completion: { status: "succeeded" } });

    expect(continueAgent).toHaveBeenCalledOnce();
    expect(continueAgent.mock.calls[0]?.[1].prompt).toContain("补充 trace 查询");
    expect(continueAgent.mock.calls[0]?.[1].prompt).toContain("review/round-1.json");
    expect(context.dependencies.publishDocument).toHaveBeenCalledTimes(2);
  });
});
