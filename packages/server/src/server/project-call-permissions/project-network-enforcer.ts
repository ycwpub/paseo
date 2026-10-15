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
  prepare(input: {
    projectId: string;
    workspaceId?: string;
    source: string;
  }): Promise<Record<string, string>>;
}

export interface ProjectNetworkEnforcerDependencies {
  paseoHome: string;
  workspaceRegistry: {
    get(workspaceId: string): Promise<NetworkPolicyWorkspace | null>;
  };
  projectRegistry: {
    get(projectId: string): Promise<NetworkPolicyProject | null>;
  };
  isExternalProxyEnabled?: () => boolean;
  adapter?: ProjectNetworkIsolationAdapter;
}

export class ProjectStrictNetworkUnavailableError extends Error {
  public readonly name = "ProjectStrictNetworkUnavailableError";
  public readonly code = "PROJECT_STRICT_NETWORK_UNAVAILABLE";

  public constructor(public readonly projectId: string) {
    super(
      `Project ${projectId} 需要使用外部代理，但当前服务器没有可用的操作系统网络隔离；已阻止启动任务`,
    );
  }
}

export class ProjectNetworkEnforcer {
  public constructor(private readonly dependencies: ProjectNetworkEnforcerDependencies) {}

  public async assertExecutionAllowed(workspaceId: string): Promise<void> {
    const context = await this.resolveProxyContext(workspaceId);
    if (!context) return;
    await this.requireActiveAdapter(context.project.projectId);
  }

  public async prepareExecutionEnvironment(
    workspaceId: string,
    source: string,
  ): Promise<Record<string, string>> {
    const context = await this.resolveProxyContext(workspaceId);
    if (!context) return {};
    const adapter = await this.requireActiveAdapter(context.project.projectId);
    return adapter.prepare({
      projectId: context.project.projectId,
      workspaceId,
      source,
    });
  }

  public async prepareProjectExecutionEnvironment(
    projectId: string,
    source: string,
  ): Promise<Record<string, string>> {
    const project = await this.resolveProxyProject(projectId);
    if (!project) return {};
    const adapter = await this.requireActiveAdapter(project.projectId);
    return adapter.prepare({
      projectId: project.projectId,
      source,
    });
  }

  private async resolveProxyContext(workspaceId: string): Promise<{
    project: NetworkPolicyProject;
  } | null> {
    if (this.dependencies.isExternalProxyEnabled?.() !== true) return null;
    const workspace = await this.dependencies.workspaceRegistry.get(workspaceId);
    if (!workspace || workspace.archivedAt) {
      throw new Error(`Workspace ${workspaceId} 不存在或已归档`);
    }
    const project = await this.resolveProxyProject(workspace.projectId);
    return project ? { project } : null;
  }

  private async resolveProxyProject(projectId: string): Promise<NetworkPolicyProject | null> {
    if (this.dependencies.isExternalProxyEnabled?.() !== true) return null;
    const project = await this.dependencies.projectRegistry.get(projectId);
    if (!project) {
      throw new Error(`Project ${projectId} 不存在`);
    }
    return project;
  }

  private async requireActiveAdapter(projectId: string): Promise<ProjectNetworkIsolationAdapter> {
    const status = (await this.dependencies.adapter?.status(projectId)) ?? "unavailable";
    if (status !== "active") {
      throw new ProjectStrictNetworkUnavailableError(projectId);
    }
    return this.dependencies.adapter!;
  }
}
