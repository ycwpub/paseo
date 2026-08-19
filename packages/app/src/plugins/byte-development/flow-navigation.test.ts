import { describe, expect, it } from "vitest";
import type { WorkspaceDescriptor } from "@/stores/session-store";
import { resolveProjectConversationWorkspace } from "./flow-navigation";

function workspace(id: string, projectId: string, pinnedAt: string | null = null) {
  return {
    id,
    projectId,
    pinnedAt,
    archivingAt: null,
  } as WorkspaceDescriptor;
}

describe("development flow project navigation", () => {
  it("keeps the current project workspace when possible", () => {
    const current = workspace("workspace-current", "project-1");
    expect(
      resolveProjectConversationWorkspace({
        projectId: "project-1",
        activeWorkspaceId: current.id,
        workspaces: [workspace("workspace-pinned", "project-1", "2026-08-19"), current],
      }),
    ).toBe(current);
  });

  it("prefers a pinned workspace when opening another project", () => {
    const pinned = workspace("workspace-pinned", "project-1", "2026-08-19");
    expect(
      resolveProjectConversationWorkspace({
        projectId: "project-1",
        activeWorkspaceId: null,
        workspaces: [workspace("workspace-other", "project-1"), pinned],
      }),
    ).toBe(pinned);
  });
});
