import { describe, expect, it } from "vitest";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { splitHiddenSidebarProjects } from "./sidebar-hidden-projects";

function project(viewKey: string): SidebarProjectEntry {
  return {
    viewKey,
    projectName: viewKey,
    projectKind: "git",
    iconWorkingDir: `/repo/${viewKey}`,
    hosts: [],
    workspaces: [],
  };
}

describe("splitHiddenSidebarProjects", () => {
  it("keeps visible and hidden project order stable", () => {
    const result = splitHiddenSidebarProjects(
      [project("a"), project("b"), project("c"), project("d")],
      new Set(["b", "d"]),
    );

    expect(result.visibleProjects.map((entry) => entry.viewKey)).toEqual(["a", "c"]);
    expect(result.hiddenProjects.map((entry) => entry.viewKey)).toEqual(["b", "d"]);
  });

  it("preserves the original array when nothing is hidden", () => {
    const projects = [project("a")];
    expect(splitHiddenSidebarProjects(projects, new Set()).visibleProjects).toBe(projects);
  });
});
