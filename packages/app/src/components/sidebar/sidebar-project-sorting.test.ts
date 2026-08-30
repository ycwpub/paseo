import { describe, expect, it } from "vitest";
import type { SidebarProjectEntry } from "@/hooks/use-sidebar-workspaces-list";
import { sortSidebarProjectsByName } from "./sidebar-project-sorting";

function project(input: {
  viewKey: string;
  projectName: string;
  workspaceIds?: string[];
}): SidebarProjectEntry {
  return {
    viewKey: input.viewKey,
    projectName: input.projectName,
    projectKind: "directory",
    iconWorkingDir: `/projects/${input.viewKey}`,
    hosts: [],
    workspaces: (input.workspaceIds ?? []).map((workspaceId) => ({
      workspaceKey: `server:${workspaceId}`,
      serverId: "server",
      workspaceId,
      projectViewKey: input.viewKey,
      projectName: input.projectName,
      projectKind: "directory",
      workspaceKind: "checkout",
      name: workspaceId,
    })),
  };
}

describe("sortSidebarProjectsByName", () => {
  it("sorts by display name naturally without changing workspace order", () => {
    const projects = [
      project({
        viewKey: "project-10",
        projectName: "Project 10",
        workspaceIds: ["ten-second", "ten-first"],
      }),
      project({ viewKey: "alpha", projectName: "alpha", workspaceIds: ["alpha"] }),
      project({ viewKey: "project-2", projectName: "Project 2", workspaceIds: ["two"] }),
    ].toReversed();

    const sorted = sortSidebarProjectsByName(projects);

    expect(sorted.map((entry) => entry.projectName)).toEqual(["alpha", "Project 2", "Project 10"]);
    expect(
      sorted
        .find((entry) => entry.viewKey === "project-10")
        ?.workspaces.map((entry) => entry.workspaceId),
    ).toEqual(["ten-second", "ten-first"]);
  });

  it("uses the project key to make equal names deterministic", () => {
    const projects = [
      project({ viewKey: "project-b", projectName: "Same" }),
      project({ viewKey: "project-a", projectName: "same" }),
    ];

    expect(sortSidebarProjectsByName(projects).map((entry) => entry.viewKey)).toEqual([
      "project-a",
      "project-b",
    ]);
  });
});
