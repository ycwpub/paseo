import { describe, expect, it } from "vitest";
import {
  type CollapsedProjectsState,
  serializeCollapsedProjects,
} from "@/stores/sidebar-collapsed-sections-store/state";
import { setWorkspaceGroupsCollapsed } from "@/stores/sidebar-collapsed-sections-store/feature-state";
function emptyState(): CollapsedProjectsState {
  return {
    collapsedProjectKeys: new Set(),
    collapsedWorkspaceGroupKeys: new Set(),
    collapsedPinned: false,
  };
}
describe("sidebar collapsed projects transitions", () => {
  it("serializes collapsed project keys for preference storage", () => {
    const state: CollapsedProjectsState = {
      collapsedProjectKeys: new Set(["project-a", "project-b"]),
      collapsedWorkspaceGroupKeys: new Set(["running"]),
      collapsedPinned: true,
    };
    expect(serializeCollapsedProjects(state)).toEqual({
      collapsedProjectKeys: ["project-a", "project-b"],
      collapsedWorkspaceGroupKeys: ["running"],
      collapsedPinned: true,
    });
  });
  it("collapses and expands workspace groups in one transition", () => {
    const collapsed = setWorkspaceGroupsCollapsed(
      emptyState(),
      ["project-a", "project-b"],
      ["running"],
      true,
    );
    expect(Array.from(collapsed.collapsedProjectKeys)).toEqual(["project-a", "project-b"]);
    expect(Array.from(collapsed.collapsedWorkspaceGroupKeys)).toEqual(["running"]);
    const expanded = setWorkspaceGroupsCollapsed(
      collapsed,
      ["project-a", "project-b"],
      ["running"],
      false,
    );
    expect(Array.from(expanded.collapsedProjectKeys)).toEqual([]);
    expect(Array.from(expanded.collapsedWorkspaceGroupKeys)).toEqual([]);
  });
});
