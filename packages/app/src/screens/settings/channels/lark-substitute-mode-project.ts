import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";
import {
  createLarkProjectBinding,
  type LarkProjectBindingClient,
  rollbackLarkProjectBinding,
} from "./lark-project-binding";
import type { LarkProjectBindingMode } from "./lark-project-binding-fields";

export type SubstituteModeProjectClient = LarkProjectBindingClient;

export interface ResolvedSubstituteModeProject {
  cwd: string;
  projectId: string | null;
  createdProjectId: string | null;
}

export async function resolveSubstituteModeProject(input: {
  name: string;
  cwd: string;
  projectId?: string | null;
  projectMode: LarkProjectBindingMode;
  supportsDirectorylessProjects: boolean;
  client: SubstituteModeProjectClient | null;
  registerProject: (project: WorkspaceProjectDescriptorPayload) => void;
}): Promise<ResolvedSubstituteModeProject> {
  const selectedCwd = input.cwd.trim();
  if (input.projectMode === "existing") {
    if (!selectedCwd) {
      throw new Error("请选择已有项目");
    }
    return { cwd: selectedCwd, projectId: input.projectId ?? null, createdProjectId: null };
  }
  if (!input.name.trim()) {
    throw new Error("请输入新项目名称");
  }

  const project = await createLarkProjectBinding({
    name: input.name,
    supportsDirectorylessProjects: input.supportsDirectorylessProjects,
    client: input.client,
    registerProject: input.registerProject,
  });
  return {
    cwd: project.cwd,
    projectId: project.projectId,
    createdProjectId: project.projectId,
  };
}

export async function rollbackSubstituteModeProject(input: {
  projectId: string | null;
  client: SubstituteModeProjectClient | null;
  unregisterProject: (projectId: string) => void;
}): Promise<boolean> {
  return rollbackLarkProjectBinding(input);
}
