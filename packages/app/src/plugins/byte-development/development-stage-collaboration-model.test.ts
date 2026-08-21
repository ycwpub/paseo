import { describe, expect, it } from "vitest";
import {
  buildDevelopmentStageAgentPrompt,
  copyDevelopmentStageCollaborations,
  developmentStageCollaborationFromInput,
  updateDevelopmentStageCollaborationInput,
} from "./development-stage-collaboration-model";

describe("development stage collaboration model", () => {
  it("provides stage-specific default knowledge", () => {
    const stage = developmentStageCollaborationFromInput({}, "development");
    expect(stage.status).toBe("pending");
    expect(stage.knowledge).toContain("保留已有改动");
    expect(stage.agentId).toBeNull();
  });

  it("persists stage knowledge and agent session without replacing flow input", () => {
    const input = updateDevelopmentStageCollaborationInput({
      currentInput: { flow_title: "支付优化", projectId: "project-1" },
      stageId: "technical_design",
      patch: {
        status: "in_progress",
        knowledge: "必须兼容旧接口",
        agentId: "agent-1",
        workspaceId: "workspace-1",
        startedAt: "2026-08-21T08:00:00.000Z",
      },
      now: "2026-08-21T08:01:00.000Z",
    });
    expect(input.flow_title).toBe("支付优化");
    expect(developmentStageCollaborationFromInput(input, "technical_design")).toEqual({
      status: "in_progress",
      knowledge: "必须兼容旧接口",
      agentId: "agent-1",
      workspaceId: "workspace-1",
      startedAt: "2026-08-21T08:00:00.000Z",
      completedAt: null,
      updatedAt: "2026-08-21T08:01:00.000Z",
    });
  });

  it("copies knowledge but resets runtime session state", () => {
    const copied = copyDevelopmentStageCollaborations({
      stage_collaboration: {
        review: {
          status: "completed",
          knowledge: "检查幂等性",
          agentId: "agent-1",
          workspaceId: "workspace-1",
          startedAt: "start",
          completedAt: "end",
          updatedAt: "end",
        },
      },
    });
    expect(copied.review).toMatchObject({
      status: "pending",
      knowledge: "检查幂等性",
      agentId: null,
      workspaceId: null,
    });
  });

  it("builds a Project collaboration prompt without leaking provider configuration", () => {
    const prompt = buildDevelopmentStageAgentPrompt({
      stageId: "prd",
      stageLabel: "PRD",
      flowTitle: "支付优化",
      projectId: "project-1",
      flowInput: {
        prd: "降低延迟",
        agent_provider: "codex",
        agent_model: "gpt-5.6",
      },
      knowledge: "先确认指标口径",
    });
    expect(prompt).toContain("与用户一起完成这个节点");
    expect(prompt).toContain("先确认指标口径");
    expect(prompt).toContain('"prd": "降低延迟"');
    expect(prompt).not.toContain("agent_provider");
  });
});
