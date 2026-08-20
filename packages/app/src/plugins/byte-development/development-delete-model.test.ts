import { describe, expect, it, vi } from "vitest";
import type { DevelopmentFlow } from "./flow-model";
import {
  countOtherDevelopmentFlowsForProject,
  deleteDevelopmentPluginProject,
} from "./development-delete-model";

function flow(id: string, projectId: string | null): DevelopmentFlow {
  return {
    id,
    projectId,
  } as DevelopmentFlow;
}

describe("byte development deletion", () => {
  it("counts other plugin projects that share the associated Project", () => {
    expect(
      countOtherDevelopmentFlowsForProject({
        flows: [flow("flow-1", "project-1"), flow("flow-2", "project-1"), flow("flow-3", null)],
        flowId: "flow-1",
        projectId: "project-1",
      }),
    ).toBe(1);
  });

  it("deletes only the plugin project when the Project is retained", async () => {
    const operations: string[] = [];
    const outcome = await deleteDevelopmentPluginProject({
      mode: "plugin_only",
      deletePluginProject: async () => {
        operations.push("plugin");
      },
      onPluginProjectDeleted: () => {
        operations.push("ui");
      },
      deleteProject: async () => {
        operations.push("project");
      },
    });

    expect(outcome).toEqual({ kind: "plugin_deleted" });
    expect(operations).toEqual(["plugin", "ui"]);
  });

  it("deletes the plugin project before deleting the associated Project", async () => {
    const operations: string[] = [];
    const outcome = await deleteDevelopmentPluginProject({
      mode: "plugin_and_project",
      deletePluginProject: async () => {
        operations.push("plugin");
      },
      onPluginProjectDeleted: () => {
        operations.push("ui");
      },
      deleteProject: async () => {
        operations.push("project");
      },
    });

    expect(outcome).toEqual({ kind: "plugin_and_project_deleted" });
    expect(operations).toEqual(["plugin", "ui", "project"]);
  });

  it("reports a partial failure after the plugin project was deleted", async () => {
    const onPluginProjectDeleted = vi.fn();
    const outcome = await deleteDevelopmentPluginProject({
      mode: "plugin_and_project",
      deletePluginProject: async () => undefined,
      onPluginProjectDeleted,
      deleteProject: async () => {
        throw new Error("Host 已断开连接");
      },
    });

    expect(outcome).toEqual({
      kind: "project_delete_failed",
      error: "Host 已断开连接",
    });
    expect(onPluginProjectDeleted).toHaveBeenCalledOnce();
  });

  it("keeps the Project untouched when plugin deletion fails", async () => {
    const onPluginProjectDeleted = vi.fn();
    const deleteProject = vi.fn();

    await expect(
      deleteDevelopmentPluginProject({
        mode: "plugin_and_project",
        deletePluginProject: async () => {
          throw new Error("插件项目删除失败");
        },
        onPluginProjectDeleted,
        deleteProject,
      }),
    ).rejects.toThrow("插件项目删除失败");
    expect(onPluginProjectDeleted).not.toHaveBeenCalled();
    expect(deleteProject).not.toHaveBeenCalled();
  });
});
