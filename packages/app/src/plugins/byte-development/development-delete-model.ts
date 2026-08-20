import type { DevelopmentFlow } from "./flow-model";

export type DevelopmentDeleteMode = "plugin_only" | "plugin_and_project";

export type DevelopmentDeleteOutcome =
  | { kind: "plugin_deleted" }
  | { kind: "plugin_and_project_deleted" }
  | { kind: "project_delete_failed"; error: string };

function errorMessage(error: unknown): string {
  return error instanceof Error ? error.message : String(error);
}

export function countOtherDevelopmentFlowsForProject(input: {
  flows: readonly DevelopmentFlow[];
  flowId: string;
  projectId: string | null;
}): number {
  if (!input.projectId) return 0;
  return input.flows.filter(
    (flow) => flow.id !== input.flowId && flow.projectId === input.projectId,
  ).length;
}

export async function deleteDevelopmentPluginProject(input: {
  mode: DevelopmentDeleteMode;
  deletePluginProject: () => Promise<void>;
  onPluginProjectDeleted: () => void;
  deleteProject?: () => Promise<void>;
}): Promise<DevelopmentDeleteOutcome> {
  await input.deletePluginProject();
  input.onPluginProjectDeleted();

  if (input.mode === "plugin_only") {
    return { kind: "plugin_deleted" };
  }
  if (!input.deleteProject) {
    return {
      kind: "project_delete_failed",
      error: "关联 Project 当前不可删除",
    };
  }

  try {
    await input.deleteProject();
    return { kind: "plugin_and_project_deleted" };
  } catch (error) {
    return {
      kind: "project_delete_failed",
      error: errorMessage(error),
    };
  }
}
