import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";

interface DirectorylessProjectPayload {
  project: WorkspaceProjectDescriptorPayload | null;
  error: string | null;
}

export interface LarkProjectBindingClient {
  createDirectorylessProject(input: { name: string }): Promise<DirectorylessProjectPayload>;
  removeProject(projectId: string): Promise<{ removedWorkspaceIds: string[] }>;
}

export interface CreatedLarkProjectBinding {
  cwd: string;
  projectId: string;
}

function projectSourceDirectory(project: WorkspaceProjectDescriptorPayload): string {
  return project.projectSourceDirectory?.trim() || project.projectRootPath.trim();
}

export async function createLarkProjectBinding(input: {
  name: string;
  supportsDirectorylessProjects: boolean;
  client: LarkProjectBindingClient | null;
  registerProject: (project: WorkspaceProjectDescriptorPayload) => void;
}): Promise<CreatedLarkProjectBinding> {
  const name = input.name.trim();
  if (!name) {
    throw new Error("请输入新项目名称");
  }
  if (!input.supportsDirectorylessProjects) {
    throw new Error("当前主机不支持自动创建 Project，请更新并重启 daemon");
  }
  if (!input.client) {
    throw new Error("主机未连接");
  }

  const payload = await input.client.createDirectorylessProject({ name });
  if (payload.error || !payload.project) {
    throw new Error(payload.error ?? "无法自动创建 Project");
  }
  const cwd = projectSourceDirectory(payload.project);
  if (!cwd) {
    await input.client.removeProject(payload.project.projectId).catch(() => undefined);
    throw new Error("Project 已创建，但服务端未返回可用的 Project 路径");
  }

  input.registerProject(payload.project);
  return {
    cwd,
    projectId: payload.project.projectId,
  };
}

export async function rollbackLarkProjectBinding(input: {
  projectId: string | null;
  client: LarkProjectBindingClient | null;
  unregisterProject: (projectId: string) => void;
}): Promise<boolean> {
  if (!input.projectId || !input.client) return true;
  try {
    await input.client.removeProject(input.projectId);
    input.unregisterProject(input.projectId);
    return true;
  } catch {
    return false;
  }
}
