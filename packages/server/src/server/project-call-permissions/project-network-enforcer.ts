import { readProjectConfigForProject } from "../project/project-config-storage.js";

interface NetworkPolicyWorkspace {
  projectId: string;
  archivedAt?: string | null;
}

interface NetworkPolicyProject {
  projectId: string;
  rootPath: string | null;
}

export interface ProjectNetworkIsolationAdapter {
  status(projectId: string): Promise<"active" | "unavailable">;
}

export interface ProjectNetworkEnforcerDependencies {
  paseoHome: string;
  workspaceRegistry: {
    get(workspaceId: string): Promise<NetworkPolicyWorkspace | null>;
  };
  projectRegistry: {
    get(projectId: string): Promise<NetworkPolicyProject | null>;
  };
  adapter?: ProjectNetworkIsolationAdapter;
}

export class ProjectStrictNetworkUnavailableError extends Error {
  public readonly name = "ProjectStrictNetworkUnavailableError";
  public readonly code = "PROJECT_STRICT_NETWORK_UNAVAILABLE";

  public constructor(public readonly projectId: string) {
    super(
      `Project ${projectId} 已启用严格网络权限，但当前主机没有可用的操作系统网络隔离；已阻止启动任务`,
    );
  }
}

export class ProjectNetworkEnforcer {
  public constructor(private readonly dependencies: ProjectNetworkEnforcerDependencies) {}

  public async assertExecutionAllowed(workspaceId: string): Promise<void> {
    const workspace = await this.dependencies.workspaceRegistry.get(workspaceId);
    if (!workspace || workspace.archivedAt) {
      throw new Error(`Workspace ${workspaceId} 不存在或已归档`);
    }
    const project = await this.dependencies.projectRegistry.get(workspace.projectId);
    if (!project) {
      throw new Error(`Project ${workspace.projectId} 不存在`);
    }
    const config = readProjectConfigForProject({
      paseoHome: this.dependencies.paseoHome,
      project,
    });
    if (!config.ok) {
      throw new Error(`无法读取 Project 权限配置：${config.error.code}`);
    }
    const permissions = config.config?.project?.permissions;
    if (permissions?.enabled !== true || permissions.enforcement !== "strict") return;
    const status = (await this.dependencies.adapter?.status(project.projectId)) ?? "unavailable";
    if (status !== "active") {
      throw new ProjectStrictNetworkUnavailableError(project.projectId);
    }
  }
}
