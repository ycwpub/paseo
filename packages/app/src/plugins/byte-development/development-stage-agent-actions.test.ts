import { describe, expect, it, vi } from "vitest";
import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import type { PluginHttpJob } from "@getpaseo/protocol/messages";
import {
  associateDevelopmentStageDraftAgent,
  buildDevelopmentStageDraftId,
  canReuseDevelopmentStageWorkspace,
  prepareDevelopmentStageDraft,
  resolveReusableDevelopmentStageSession,
} from "./development-stage-agent-actions";
import { developmentFlowFromJob } from "./flow-model";

function flow() {
  const job: PluginHttpJob = {
    id: "flow-1",
    pluginId: "byte-development",
    serviceName: "development",
    projectId: "project-1",
    status: "draft",
    input: {
      flow_title: "支付链路优化",
      projectId: "project-1",
      agent_provider: "codex",
      agent_model: "gpt-5.6",
      prd: "降低支付延迟",
    },
    result: null,
    workflowRunId: null,
    error: null,
    errorCode: null,
    createdAt: "2026-08-21T08:00:00.000Z",
    startedAt: null,
    endedAt: null,
  };
  const result = developmentFlowFromJob(job);
  if (!result) throw new Error("expected development flow");
  return result;
}

describe("development stage agent actions", () => {
  it("only reuses active workspaces from the target Project", () => {
    expect(
      canReuseDevelopmentStageWorkspace({
        projectId: "project-1",
        workspace: {
          id: "workspace-1",
          projectId: "project-1",
          workspaceDirectory: "/repo",
        },
      }),
    ).toBe(true);
    expect(
      canReuseDevelopmentStageWorkspace({
        projectId: "project-1",
        workspace: {
          id: "workspace-wrong",
          projectId: "project-code-repos",
          workspaceDirectory: "/repo/code_repos",
        },
      }),
    ).toBe(false);
    expect(
      canReuseDevelopmentStageWorkspace({
        projectId: "project-1",
        workspace: {
          id: "workspace-archiving",
          projectId: "project-1",
          workspaceDirectory: "/repo",
          archivingAt: "2026-08-21T08:00:00.000Z",
        },
      }),
    ).toBe(false);
  });

  it("does not reuse a saved Agent session from a cwd-derived Project", () => {
    expect(
      resolveReusableDevelopmentStageSession({
        projectId: "project-1",
        agentId: "agent-code-repos",
        workspaceId: "workspace-code-repos",
        workspace: {
          id: "workspace-code-repos",
          projectId: "project-code-repos",
          workspaceDirectory: "/repo/code_repos",
        },
      }),
    ).toBeNull();
    expect(
      resolveReusableDevelopmentStageSession({
        projectId: "project-1",
        agentId: "agent-1",
        workspaceId: "workspace-1",
        workspace: {
          id: "workspace-1",
          projectId: "project-1",
          workspaceDirectory: "/repo",
        },
      }),
    ).toEqual({ agentId: "agent-1", workspaceId: "workspace-1" });
  });

  it("prepares the node draft inside an existing Project workspace without creating an Agent", async () => {
    const createAgent = vi.fn();
    const client = { createAgent } as unknown as DaemonClient;
    const result = await prepareDevelopmentStageDraft({
      client,
      flow: flow(),
      stageId: "development",
      knowledge: "仅修改支付模块",
      flowInput: flow().job.input as Record<string, unknown>,
      sourceDirectory: "/repo",
      existingWorkspace: {
        id: "workspace-1",
        projectId: "project-1",
        workspaceDirectory: "/repo",
      },
    });

    expect(result).toMatchObject({
      workspaceId: "workspace-1",
      workspaceDirectory: "/repo",
    });
    expect(result.prompt).toContain("仅修改支付模块");
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("creates a Project workspace before preparing the draft when none exists", async () => {
    const createWorkspace = vi.fn().mockResolvedValue({
      error: null,
      workspace: {
        id: "workspace-new",
        projectId: "project-1",
        workspaceDirectory: "/repo",
      },
    });
    const createAgent = vi.fn();
    const client = { createWorkspace, createAgent } as unknown as DaemonClient;
    const result = await prepareDevelopmentStageDraft({
      client,
      flow: flow(),
      stageId: "prd",
      knowledge: "先确认验收口径",
      flowInput: flow().job.input as Record<string, unknown>,
      sourceDirectory: "/repo",
      existingWorkspace: null,
    });

    expect(createWorkspace).toHaveBeenCalledWith({
      source: { kind: "directory", path: "/repo", projectId: "project-1" },
      title: "支付链路优化",
    });
    expect(result.workspaceId).toBe("workspace-new");
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("rejects a newly created workspace that was attached to another Project", async () => {
    const createWorkspace = vi.fn().mockResolvedValue({
      error: null,
      workspace: {
        id: "workspace-wrong",
        projectId: "project-code-repos",
        workspaceDirectory: "/repo/code_repos",
      },
    });
    const createAgent = vi.fn();
    const client = { createWorkspace, createAgent } as unknown as DaemonClient;

    await expect(
      prepareDevelopmentStageDraft({
        client,
        flow: flow(),
        stageId: "development",
        knowledge: "",
        flowInput: flow().job.input as Record<string, unknown>,
        sourceDirectory: "/repo/code_repos",
        existingWorkspace: null,
      }),
    ).rejects.toThrow("预期 project-1，实际 project-code-repos");
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("rejects an existing workspace that belongs to another Project", async () => {
    const createAgent = vi.fn();
    const client = { createAgent } as unknown as DaemonClient;

    await expect(
      prepareDevelopmentStageDraft({
        client,
        flow: flow(),
        stageId: "review",
        knowledge: "",
        flowInput: flow().job.input as Record<string, unknown>,
        sourceDirectory: "/repo/code_repos",
        existingWorkspace: {
          id: "workspace-wrong",
          projectId: "project-code-repos",
          workspaceDirectory: "/repo/code_repos",
        },
      }),
    ).rejects.toThrow("预期 project-1，实际 project-code-repos");
    expect(createAgent).not.toHaveBeenCalled();
  });

  it("associates a manually submitted draft with its development stage", async () => {
    const draftId = buildDevelopmentStageDraftId("draft-1");
    const currentFlow = flow();
    const job = {
      ...currentFlow.job,
      input: {
        ...(currentFlow.job.input as Record<string, unknown>),
        stage_collaboration: {
          development: {
            status: "pending",
            knowledge: "仅修改支付模块",
            draftId,
            agentId: null,
            workspaceId: "workspace-1",
            startedAt: null,
            completedAt: null,
            updatedAt: "2026-08-21T08:00:00.000Z",
          },
        },
      },
    };
    const listPluginAppJobs = vi.fn().mockResolvedValue({ jobs: [job], error: null });
    const updatePluginAppJob = vi.fn().mockImplementation(async (_jobId, input) => ({
      job: { ...job, input },
      error: null,
    }));
    const client = {
      listPluginAppJobs,
      updatePluginAppJob,
    } as unknown as DaemonClient;

    await expect(
      associateDevelopmentStageDraftAgent({
        client,
        serverId: "server-1",
        draftId,
        agentId: "agent-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(true);

    expect(updatePluginAppJob).toHaveBeenCalledWith(
      "flow-1",
      expect.objectContaining({
        stage_collaboration: expect.objectContaining({
          development: expect.objectContaining({
            status: "in_progress",
            draftId: null,
            agentId: "agent-1",
            workspaceId: "workspace-1",
          }),
        }),
      }),
    );
  });

  it("ignores ordinary Project drafts without querying plugin jobs", async () => {
    const listPluginAppJobs = vi.fn();
    const client = { listPluginAppJobs } as unknown as DaemonClient;

    await expect(
      associateDevelopmentStageDraftAgent({
        client,
        serverId: "server-1",
        draftId: "draft-ordinary",
        agentId: "agent-1",
        workspaceId: "workspace-1",
      }),
    ).resolves.toBe(false);
    expect(listPluginAppJobs).not.toHaveBeenCalled();
  });
});
