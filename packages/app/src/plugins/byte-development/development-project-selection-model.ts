import type { WorkspaceProjectDescriptorPayload } from "@getpaseo/protocol/messages";

export type DevelopmentProjectMode = "existing" | "new";

export type DevelopmentProjectSelection =
  | {
      mode: "existing";
      existingProjectId: string | null;
    }
  | {
      mode: "new";
      newProjectName: string;
    };

export type ResolvedDevelopmentProjectSelection =
  | {
      mode: "existing";
      projectId: string;
      createdProject: null;
    }
  | {
      mode: "new";
      projectId: string;
      createdProject: WorkspaceProjectDescriptorPayload;
    };

type ResolveDevelopmentProjectSelectionInput =
  | {
      selection: Extract<DevelopmentProjectSelection, { mode: "existing" }>;
    }
  | {
      selection: Extract<DevelopmentProjectSelection, { mode: "new" }>;
      createProject: (projectName: string) => Promise<WorkspaceProjectDescriptorPayload>;
    };

export async function resolveDevelopmentProjectSelection(
  input: ResolveDevelopmentProjectSelectionInput,
): Promise<ResolvedDevelopmentProjectSelection> {
  if (!("createProject" in input)) {
    const projectId = input.selection.existingProjectId?.trim() ?? "";
    if (!projectId) {
      throw new Error("请选择用于承载开发流程的已有 Project");
    }
    return {
      mode: "existing",
      projectId,
      createdProject: null,
    };
  }

  const createdProject = await input.createProject(input.selection.newProjectName.trim());
  return {
    mode: "new",
    projectId: createdProject.projectId,
    createdProject,
  };
}
