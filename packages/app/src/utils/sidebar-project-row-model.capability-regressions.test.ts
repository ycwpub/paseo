import { describe, expect, it } from "vitest";
import type {
  SidebarProjectEntry,
  SidebarWorkspaceEntry,
} from "@/hooks/use-sidebar-workspaces-list";
import { buildFeatureSidebarProjectRowModel } from "./feature-sidebar-project-row-model";
function workspace(overrides: Partial<SidebarWorkspaceEntry> = {}): SidebarWorkspaceEntry {
  return {
    workspaceKey: "srv:ws-root",
    serverId: "srv",
    workspaceId: "ws-root",
    projectViewKey: "project-1",
    projectName: "paseo",
    workspaceDirectory: "/repo",
    workspaceDirectoryLabel: "/repo",
    projectKind: "git",
    workspaceKind: "checkout",
    name: "paseo",
    title: null,
    currentBranch: null,
    statusBucket: "done",
    diffStat: null,
    prHint: null,
    archiveHasUncommittedChanges: null,
    archiveUnpushedCommitCount: null,
    scripts: [],
    hasRunningScripts: false,
    statusEnteredAt: null,
    ...overrides,
    projectId: overrides.projectId ?? "project-srv",
    archivingAt: overrides.archivingAt ?? null,
  };
}
type ProjectOverrides = Omit<Partial<SidebarProjectEntry>, "hosts"> & {
  hosts?: Array<
    Omit<SidebarProjectEntry["hosts"][number], "projectId"> & {
      projectId?: string;
    }
  >;
};
function project(overrides: ProjectOverrides = {}): SidebarProjectEntry {
  const projectKind = overrides.projectKind ?? "git";
  const hosts = Array.from(
    overrides.hosts ?? [
      {
        serverId: "srv",
        iconWorkingDir: "/repo",
        worktreeSupport: projectKind === "git" ? "supported" : "unsupported",
      },
    ],
    (host) => Object.assign({}, host, { projectId: host.projectId ?? `project-${host.serverId}` }),
  );
  return {
    viewKey: "project-1",
    projectName: "paseo",
    projectKind,
    iconWorkingDir: "/repo",
    workspaces: [workspace()],
    ...overrides,
    hosts,
  };
}
describe("buildSidebarProjectRowModel", () => {
  it("shows the new workspace action for a directoryless Project on a multiplicity-capable host", () => {
    const result = buildFeatureSidebarProjectRowModel({
      project: project({
        projectKind: "directory",
        iconWorkingDir: "",
        workspaces: [],
        hosts: [
          {
            serverId: "srv",
            iconWorkingDir: "",
            worktreeSupport: "unsupported",
          },
        ],
      }),
      collapsed: false,
      supportsMultiplicityByServerId: new Map([["srv", true]]),
    });
    expect(result.trailingAction).toEqual({
      kind: "new_workspace",
      target: { serverId: "srv", projectId: "project-srv", iconWorkingDir: "" },
    });
  });
  it("uses a host-managed source directory for a directoryless Project", () => {
    const result = buildFeatureSidebarProjectRowModel({
      project: project({
        projectKind: "directory",
        iconWorkingDir: "",
        workspaces: [],
        hosts: [
          {
            serverId: "srv",
            iconWorkingDir: "",
            sourceDirectory: "/managed/project",
            worktreeSupport: "unsupported",
          },
        ],
      }),
      collapsed: false,
      supportsMultiplicityByServerId: new Map([["srv", true]]),
    });
    expect(result.trailingAction).toEqual({
      kind: "new_workspace",
      target: {
        serverId: "srv",
        projectId: "project-srv",
        iconWorkingDir: "/managed/project",
      },
    });
  });
});
