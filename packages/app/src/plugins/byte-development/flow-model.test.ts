import { describe, expect, it } from "vitest";
import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import {
  developmentFlowFromJob,
  developmentFlowsFromJobs,
  developmentFlowStatusLabel,
  developmentJobStatusLabel,
} from "./flow-model";

function job(overrides: Partial<PluginHttpJob> = {}): PluginHttpJob {
  return {
    id: "11111111-1111-4111-8111-111111111111",
    pluginId: "byte-development",
    serviceName: "development",
    status: "queued",
    input: {
      projectId: "project-1",
      flow_title: "支付链路优化",
      prd: "降低支付延迟",
    },
    result: null,
    workflowRunId: null,
    error: null,
    errorCode: null,
    createdAt: "2026-08-19T08:00:00.000Z",
    startedAt: null,
    endedAt: null,
    ...overrides,
  };
}

describe("byte development flow model", () => {
  it("maps a plugin job to a project development flow", () => {
    expect(developmentFlowFromJob(job())).toMatchObject({
      projectId: "project-1",
      title: "支付链路优化",
      summary: "降低支付延迟",
      currentStage: "prd",
    });
  });

  it("accepts historical snake-case project ids and sorts by activity", () => {
    const older = job({
      id: "11111111-1111-4111-8111-111111111112",
      input: { project_id: "project-1", prd: "旧需求" },
    });
    const newer = job({
      id: "11111111-1111-4111-8111-111111111113",
      status: "succeeded",
      createdAt: "2026-08-19T09:00:00.000Z",
    });
    expect(developmentFlowsFromJobs([older, newer]).map((flow) => flow.id)).toEqual([
      newer.id,
      older.id,
    ]);
    expect(developmentFlowFromJob(older)?.projectId).toBe("project-1");
  });

  it("uses friendly status labels", () => {
    expect(developmentJobStatusLabel("draft")).toBe("草稿");
    expect(developmentJobStatusLabel("running")).toBe("进行中");
    expect(developmentJobStatusLabel("failed")).toBe("失败");
  });

  it("keeps a draft flow on the PRD stage without requiring PRD content", () => {
    expect(
      developmentFlowFromJob(
        job({
          status: "draft",
          input: { projectId: "project-1", flow_title: "支付链路优化" },
        }),
      ),
    ).toMatchObject({
      title: "支付链路优化",
      summary: "暂无需求摘要",
      currentStage: "prd",
    });
  });

  it("derives the active stage and status from Project collaboration records", () => {
    const flow = developmentFlowFromJob(
      job({
        status: "draft",
        input: {
          projectId: "project-1",
          flow_title: "支付链路优化",
          stage_collaboration: {
            prd: { status: "completed", knowledge: "PRD 规范" },
            technical_design: { status: "in_progress", agentId: "agent-1" },
          },
        },
      }),
    );
    expect(flow?.currentStage).toBe("technical_design");
    expect(flow ? developmentFlowStatusLabel(flow) : null).toBe("协作中");
  });

  it("shows an explicitly started stage even when an earlier stage is still pending", () => {
    expect(
      developmentFlowFromJob(
        job({
          status: "draft",
          input: {
            projectId: "project-1",
            flow_title: "支付链路优化",
            stage_collaboration: {
              review: { status: "in_progress", agentId: "agent-review" },
            },
          },
        }),
      )?.currentStage,
    ).toBe("review");
  });
});
