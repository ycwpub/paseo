import { describe, expect, it } from "vitest";
import type { ProjectSummary } from "@/utils/projects";
import {
  filterHistoryProjects,
  resolveHistoryProjectKeysByServerId,
} from "./history-project-filter-model";

function project(input: {
  viewKey: string;
  name: string;
  hosts: Array<{ serverId: string; projectId: string }>;
}): ProjectSummary {
  return {
    viewKey: input.viewKey,
    projectName: input.name,
    hosts: input.hosts.map((host) => ({
      ...host,
      projectName: input.name,
      projectCustomName: null,
      serverName: host.serverId,
      isOnline: true,
      projectPath: `/repo/${host.projectId}`,
      repoRoot: `/repo/${host.projectId}`,
      isDirectoryless: false,
      workspaceCount: 1,
      workspaces: [],
    })),
    totalWorkspaceCount: input.hosts.length,
    hostCount: input.hosts.length,
    onlineHostCount: input.hosts.length,
  };
}

describe("history project filter", () => {
  const shared = project({
    viewKey: "remote:acme/shared",
    name: "acme/shared",
    hosts: [
      { serverId: "mac", projectId: "project-mac" },
      { serverId: "linux", projectId: "project-linux" },
    ],
  });
  const local = project({
    viewKey: '["mac","project-local"]',
    name: "local",
    hosts: [{ serverId: "mac", projectId: "project-local" }],
  });

  it("limits project options to the selected host", () => {
    expect(filterHistoryProjects([shared, local], "linux").map((item) => item.viewKey)).toEqual([
      shared.viewKey,
    ]);
    expect(filterHistoryProjects([shared, local], null)).toEqual([shared, local]);
  });

  it("maps a grouped project to each host's local project id", () => {
    expect(resolveHistoryProjectKeysByServerId(shared, null)).toEqual({
      mac: ["project-mac"],
      linux: ["project-linux"],
    });
    expect(resolveHistoryProjectKeysByServerId(shared, "linux")).toEqual({
      linux: ["project-linux"],
    });
  });
});
