import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";

interface DirectorylessProjectPayload {
  project: WorkspaceProjectDescriptorPayload | null;
  error: string | null;
}

export interface SubstituteModeProjectClient {
  createDirectorylessProject(input: { name: string }): Promise<DirectorylessProjectPayload>;
  removeProject(projectId: string): Promise<{ removedWorkspaceIds: string[] }>;
}

export interface ResolvedSubstituteModeProject {
  cwd: string;
  createdProjectId: string | null;
}

function projectSourceDirectory(project: WorkspaceProjectDescriptorPayload): string {
  return project.projectSourceDirectory?.trim() || project.projectRootPath.trim();
}

export async function resolveSubstituteModeProject(input: {
  name: string;
  cwd: string;
  supportsDirectorylessProjects: boolean;
  client: SubstituteModeProjectClient | null;
  registerProject: (project: WorkspaceProjectDescriptorPayload) => void;
}): Promise<ResolvedSubstituteModeProject> {
  const selectedCwd = input.cwd.trim();
  if (selectedCwd) {
    return { cwd: selectedCwd, createdProjectId: null };
  }

  const name = input.name.trim();
  if (!name) {
    throw new Error("请输入替身模式名称");
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
    createdProjectId: payload.project.projectId,
  };
}

export async function rollbackSubstituteModeProject(input: {
  projectId: string | null;
  client: SubstituteModeProjectClient | null;
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
