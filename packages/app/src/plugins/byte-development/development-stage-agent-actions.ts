import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  DEVELOPMENT_PLUGIN_ID,
  DEVELOPMENT_SERVICE_NAME,
  DEVELOPMENT_STAGES,
  type DevelopmentFlow,
  type DevelopmentStageId,
} from "./flow-model";
import {
  buildDevelopmentStageAgentPrompt,
  developmentStageCollaborationFromInput,
  updateDevelopmentStageCollaborationInput,
} from "./development-stage-collaboration-model";
import { queryClient } from "@/data/query-client";
import { developmentFlowsQueryKey, replaceDevelopmentFlow } from "./use-development-flows";

const DEVELOPMENT_STAGE_DRAFT_PREFIX = "development_stage_";

export interface DevelopmentStageWorkspaceTarget {
  id: string;
  projectId: string;
  workspaceDirectory: string;
  archivingAt?: string | null;
}

export function canReuseDevelopmentStageWorkspace(input: {
  projectId: string;
  workspace: DevelopmentStageWorkspaceTarget | null;
}): boolean {
  return (
    input.workspace?.projectId === input.projectId &&
    !input.workspace.archivingAt &&
    Boolean(input.workspace.workspaceDirectory)
  );
}

export function resolveReusableDevelopmentStageSession(input: {
  projectId: string;
  agentId: string | null;
  workspaceId: string | null;
  workspace: DevelopmentStageWorkspaceTarget | null;
}): { agentId: string; workspaceId: string } | null {
  if (!input.agentId || !input.workspaceId) return null;
  if (!canReuseDevelopmentStageWorkspace(input)) return null;
  return { agentId: input.agentId, workspaceId: input.workspaceId };
}

function asInputRecord(value: unknown): Record<string, unknown> {
  return typeof value === "object" && value !== null && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

async function ensureDevelopmentStageWorkspace(input: {
  client: DaemonClient;
  flow: DevelopmentFlow;
  projectId: string;
  sourceDirectory: string | null;
  existingWorkspace: DevelopmentStageWorkspaceTarget | null;
}): Promise<DevelopmentStageWorkspaceTarget> {
  if (input.existingWorkspace) {
    if (
      !canReuseDevelopmentStageWorkspace({
        projectId: input.projectId,
        workspace: input.existingWorkspace,
      })
    ) {
      throw new Error(
        `现有 workspace 未归属目标 Project：预期 ${input.projectId}，实际 ${input.existingWorkspace.projectId}`,
      );
    }
    return input.existingWorkspace;
  }
  if (!input.sourceDirectory) {
    throw new Error("Project 没有可用目录，请先在 Project 设置中添加项目目录");
  }
  const result = await input.client.createWorkspace({
    source: {
      kind: "directory",
      path: input.sourceDirectory,
      projectId: input.projectId,
    },
    title: input.flow.title,
  });
  if (result.error || !result.workspace) {
    throw new Error(result.error ?? "创建 Project workspace 失败");
  }
  if (result.workspace.projectId !== input.projectId) {
    throw new Error(
      `创建的 workspace 未归属目标 Project：预期 ${input.projectId}，实际 ${result.workspace.projectId}`,
    );
  }
  return {
    id: result.workspace.id,
    projectId: result.workspace.projectId,
    workspaceDirectory: result.workspace.workspaceDirectory,
  };
}

export function buildDevelopmentStageDraftId(draftId: string): string {
  return `${DEVELOPMENT_STAGE_DRAFT_PREFIX}${draftId}`;
}

export function isDevelopmentStageDraftId(draftId: string): boolean {
  return draftId.startsWith(DEVELOPMENT_STAGE_DRAFT_PREFIX);
}

export async function prepareDevelopmentStageDraft(input: {
  client: DaemonClient;
  flow: DevelopmentFlow;
  stageId: DevelopmentStageId;
  knowledge: string;
  flowInput: Record<string, unknown>;
  sourceDirectory: string | null;
  existingWorkspace: DevelopmentStageWorkspaceTarget | null;
}): Promise<{ workspaceId: string; workspaceDirectory: string; prompt: string }> {
  const projectId = input.flow.projectId;
  if (!projectId) throw new Error("开发流程没有关联 Project");
  const workspace = await ensureDevelopmentStageWorkspace({
    client: input.client,
    flow: input.flow,
    projectId,
    sourceDirectory: input.sourceDirectory,
    existingWorkspace: input.existingWorkspace,
  });
  const stageLabel =
    DEVELOPMENT_STAGES.find((candidate) => candidate.id === input.stageId)?.label ?? input.stageId;
  return {
    workspaceId: workspace.id,
    workspaceDirectory: workspace.workspaceDirectory,
    prompt: buildDevelopmentStageAgentPrompt({
      stageId: input.stageId,
      stageLabel,
      flowTitle: input.flow.title,
      projectId,
      flowInput: input.flowInput,
      knowledge: input.knowledge,
    }),
  };
}

export async function associateDevelopmentStageDraftAgent(input: {
  client: DaemonClient;
  serverId: string;
  draftId: string;
  agentId: string;
  workspaceId: string;
}): Promise<boolean> {
  if (!isDevelopmentStageDraftId(input.draftId)) return false;

  const result = await input.client.listPluginAppJobs({
    pluginId: DEVELOPMENT_PLUGIN_ID,
    serviceName: DEVELOPMENT_SERVICE_NAME,
    limit: 500,
  });
  if (result.error) throw new Error(result.error);

  for (const job of result.jobs) {
    for (const stage of DEVELOPMENT_STAGES) {
      const collaboration = developmentStageCollaborationFromInput(job.input, stage.id);
      if (collaboration.draftId !== input.draftId) continue;

      const startedAt = new Date().toISOString();
      const updated = await input.client.updatePluginAppJob(
        job.id,
        updateDevelopmentStageCollaborationInput({
          currentInput: asInputRecord(job.input),
          stageId: stage.id,
          patch: {
            status: "in_progress",
            draftId: null,
            agentId: input.agentId,
            workspaceId: input.workspaceId,
            startedAt,
            completedAt: null,
          },
          now: startedAt,
        }),
      );
      if (updated.error || !updated.job) {
        throw new Error(updated.error ?? "关联开发节点 Agent 失败");
      }
      queryClient.setQueryData(
        developmentFlowsQueryKey(input.serverId),
        (current: DevelopmentFlow[] | undefined) => replaceDevelopmentFlow(current, updated.job!),
      );
      return true;
    }
  }
  return false;
}
