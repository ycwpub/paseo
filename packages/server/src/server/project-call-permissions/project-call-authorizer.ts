import {
  evaluateProjectCallPermission,
  type ProjectCallPermissionDecision,
  type ProjectCallRequest,
} from "@getpaseo/protocol/messages";
import { readProjectConfigForProject } from "../project/project-config-storage.js";
import type { ProjectCallAuditStore } from "./project-call-audit-store.js";

interface ProjectCallWorkspace {
  projectId: string;
  archivedAt?: string | null;
}

interface ProjectCallProject {
  projectId: string;
  rootPath: string | null;
}

export interface ProjectCallAuthorizerDependencies {
  paseoHome: string;
  workspaceRegistry: {
    get(workspaceId: string): Promise<ProjectCallWorkspace | null>;
  };
  projectRegistry: {
    get(projectId: string): Promise<ProjectCallProject | null>;
  };
  isExternalProxyEnabled?: () => boolean;
  auditStore?: Pick<ProjectCallAuditStore, "append">;
}

export interface AuthorizeProjectCallInput {
  workspaceId?: string;
  projectId?: string;
  agentId?: string;
  taskId?: string;
  source: string;
  request: ProjectCallRequest;
}

function projectCallTarget(request: ProjectCallRequest): string {
  return request.kind === "rpc" ? request.target : request.url;
}

export class ProjectPermissionDeniedError extends Error {
  public readonly name = "ProjectPermissionDeniedError";
  public readonly code = "PROJECT_PERMISSION_DENIED";

  public constructor(
    public readonly projectId: string,
    public readonly target: string,
    public readonly matchedRuleId: string | null,
  ) {
    super(
      matchedRuleId
        ? `Project ${projectId} 无权调用 ${target}；命中规则：${matchedRuleId}`
        : `Project ${projectId} 无权调用 ${target}；未命中允许规则`,
    );
  }
}

export class ProjectCallAuthorizer {
  public constructor(private readonly dependencies: ProjectCallAuthorizerDependencies) {}

  public async authorize(input: AuthorizeProjectCallInput): Promise<ProjectCallPermissionDecision> {
    const startedAt = Date.now();
    if (Boolean(input.workspaceId) === Boolean(input.projectId)) {
      throw new Error("Project 调用必须且只能指定 workspaceId 或 projectId");
    }
    let projectId = input.projectId;
    if (input.workspaceId) {
      const workspace = await this.dependencies.workspaceRegistry.get(input.workspaceId);
      if (!workspace || workspace.archivedAt) {
        throw new Error(`Workspace ${input.workspaceId} 不存在或已归档`);
      }
      projectId = workspace.projectId;
    }
    const project = await this.dependencies.projectRegistry.get(projectId!);
    if (!project) {
      throw new Error(`Project ${projectId} 不存在`);
    }
    const config = readProjectConfigForProject({
      paseoHome: this.dependencies.paseoHome,
      project,
    });
    if (!config.ok) {
      throw new Error(`无法读取 Project 权限配置：${config.error.code}`);
    }
    const httpPolicyEnabled =
      input.request.kind !== "http" || this.dependencies.isExternalProxyEnabled?.() !== false;
    const decision = evaluateProjectCallPermission(
      httpPolicyEnabled ? config.config?.project?.permissions : undefined,
      input.request,
    );
    await this.dependencies.auditStore?.append({
      projectId: project.projectId,
      ...(input.workspaceId ? { workspaceId: input.workspaceId } : {}),
      ...(input.agentId ? { agentId: input.agentId } : {}),
      ...(input.taskId ? { taskId: input.taskId } : {}),
      source: input.source,
      request: input.request,
      decision,
      durationMs: Date.now() - startedAt,
    });
    if (!decision.allowed) {
      throw new ProjectPermissionDeniedError(
        project.projectId,
        projectCallTarget(input.request),
        decision.matchedRuleId,
      );
    }
    return decision;
  }
}
