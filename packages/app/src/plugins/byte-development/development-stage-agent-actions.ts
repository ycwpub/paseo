import type { DaemonClient } from "@getpaseo/client/internal/daemon-client";
import {
  DEVELOPMENT_PLUGIN_ID,
  DEVELOPMENT_STAGES,
  type DevelopmentFlow,
  type DevelopmentStageId,
} from "./flow-model";
import {
  buildDevelopmentStageAgentPrompt,
  buildDevelopmentStageSystemPrompt,
} from "./development-stage-collaboration-model";

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

function readRequiredAgentSetting(
  flowInput: Record<string, unknown>,
  key: "agent_provider" | "agent_model",
): string {
  const value = flowInput[key];
  const normalized = typeof value === "string" ? value.trim() : "";
  if (!normalized) {
    throw new Error("开发流程没有默认 Provider 或模型，请先编辑流程配置");
  }
  return normalized;
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

export async function createDevelopmentStageAgent(input: {
  client: DaemonClient;
  flow: DevelopmentFlow;
  stageId: DevelopmentStageId;
  knowledge: string;
  flowInput: Record<string, unknown>;
  sourceDirectory: string | null;
  existingWorkspace: DevelopmentStageWorkspaceTarget | null;
}): Promise<{ agentId: string; workspaceId: string; startedAt: string }> {
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
  const provider = readRequiredAgentSetting(input.flowInput, "agent_provider");
  const model = readRequiredAgentSetting(input.flowInput, "agent_model");
  const startedAt = new Date().toISOString();
  const agent = await input.client.createAgent({
    provider,
    model,
    cwd: workspace.workspaceDirectory,
    workspaceId: workspace.id,
    title: `${input.flow.title} · ${stageLabel}`,
    systemPrompt: buildDevelopmentStageSystemPrompt({
      stageLabel,
      knowledge: input.knowledge,
    }),
    initialPrompt: buildDevelopmentStageAgentPrompt({
      stageId: input.stageId,
      stageLabel,
      flowTitle: input.flow.title,
      projectId,
      flowInput: input.flowInput,
      knowledge: input.knowledge,
    }),
    // A development stage is an ongoing Project conversation. Finishing an
    // Agent turn or marking the stage complete must not archive the session.
    autoArchive: false,
    labels: {
      "paseo.plugin": DEVELOPMENT_PLUGIN_ID,
      "paseo.plugin-project-id": input.flow.id,
      "paseo.development-stage": input.stageId,
      "paseo.project-id": projectId,
    },
  });
  return {
    agentId: agent.id,
    workspaceId: workspace.id,
    startedAt,
  };
}
