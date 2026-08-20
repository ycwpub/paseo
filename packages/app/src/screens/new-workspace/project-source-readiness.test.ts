import { describe, expect, it } from "vitest";
import type { HostProjectListItem } from "@/projects/host-projects";
import { resolveProjectSourceReadiness } from "./project-source-readiness";

function project(host?: HostProjectListItem["hosts"][number]): HostProjectListItem {
  return {
    viewKey: "project",
    projectKey: null,
    projectName: "Project",
    projectKind: "non_git",
    iconWorkingDir: "",
    hosts: host ? [host] : [],
    workspaceKeys: [],
  };
}

describe("project source readiness", () => {
  it("distinguishes a missing Host placement", () => {
    expect(resolveProjectSourceReadiness({ project: project(), serverId: "host-a" })).toEqual({
      kind: "missing_host",
    });
  });

  it("distinguishes a Host-bound Project without an execution directory", () => {
    expect(
      resolveProjectSourceReadiness({
        project: project({
          serverId: "host-a",
          projectId: "prj_empty",
          iconWorkingDir: "",
          worktreeSupport: "unsupported",
        }),
        serverId: "host-a",
      }),
    ).toEqual({ kind: "missing_directory", projectId: "prj_empty" });
  });

  it("uses the explicit source directory independently from the icon directory", () => {
    expect(
      resolveProjectSourceReadiness({
        project: project({
          serverId: "host-a",
          projectId: "prj_empty",
          iconWorkingDir: "",
          sourceDirectory: "/host-managed/prj_empty",
          worktreeSupport: "unsupported",
        }),
        serverId: "host-a",
      }),
    ).toEqual({
      kind: "ready",
      projectId: "prj_empty",
      sourceDirectory: "/host-managed/prj_empty",
    });
  });
});
