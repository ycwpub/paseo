import { describe, expect, it } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { resolvePluginProjectConversationWorkspace } from "./plugin-project-navigation-model";

function workspace(
  id: string,
  projectId: string,
  overrides: Partial<WorkspaceDescriptor> = {},
): WorkspaceDescriptor {
  return {
    id,
    name: id,
    title: null,
    projectId,
    projectDisplayName: projectId,
    projectRootPath: "",
    workspaceDirectory: "",
    projectKind: "directory",
    workspaceKind: "local_checkout",
    status: "done",
    statusEnteredAt: null,
    archivingAt: null,
    pinnedAt: null,
    diffStat: null,
    scripts: [],
    ...overrides,
  };
}

describe("plugin project navigation model", () => {
  it("prefers the active workspace, then pinned, then first", () => {
    const first = workspace("first", "project-1");
    const pinned = workspace("pinned", "project-1", {
      pinnedAt: "2026-08-20T01:00:00.000Z",
    });
    expect(
      resolvePluginProjectConversationWorkspace({
        projectId: "project-1",
        activeWorkspaceId: "first",
        workspaces: [pinned, first],
      })?.id,
    ).toBe("first");
    expect(
      resolvePluginProjectConversationWorkspace({
        projectId: "project-1",
        activeWorkspaceId: null,
        workspaces: [first, pinned],
      })?.id,
    ).toBe("pinned");
  });
});
