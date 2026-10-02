import { describe, expect, it } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import {
  buildHostedPluginProjectRemoveTarget,
  buildHostedPluginProjects,
  pluginProjectHostKey,
  resolvePluginProjectHostIds,
  resolvePluginProjectInitialHostId,
  resolvePluginProjectSelectionKey,
} from "./plugin-project-host-model";
import type { PluginProjectOption } from "./plugin-project-model";

const HOSTS = [
  { serverId: "host-a", label: "开发机" },
  { serverId: "host-b", label: "测试机" },
  { serverId: "host-c", label: "离线机" },
];

function appState(projectId: string, updatedAt: string): PluginAppState {
  return {
    pluginId: "demo",
    appId: "console",
    projectId,
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    knowledge: "",
    data: {},
    document: null,
    conversation: [],
    createdAt: updatedAt,
    updatedAt,
  };
}

function projectOption(projectId: string, name: string): PluginProjectOption {
  return {
    id: projectId,
    value: projectId,
    label: name,
    projectName: name,
    description: `/repo/${projectId}`,
    sourceDirectory: `/repo/${projectId}`,
  };
}

describe("plugin project host model", () => {
  it("uses every available plugin host when the workspace host filter is empty", () => {
    expect(resolvePluginProjectHostIds(HOSTS, [], ["host-a", "host-c"])).toEqual([
      "host-a",
      "host-c",
    ]);
  });

  it("keeps only plugin hosts selected by the workspace host filter", () => {
    expect(
      resolvePluginProjectHostIds(HOSTS, ["host-b", "host-c"], ["host-a", "host-b", "host-c"]),
    ).toEqual(["host-b", "host-c"]);
  });

  it("falls back to every available plugin host when persisted filters no longer match a host", () => {
    expect(resolvePluginProjectHostIds(HOSTS, ["removed-host"], ["host-a", "host-b"])).toEqual([
      "host-a",
      "host-b",
    ]);
  });

  it("keeps equal Project IDs on different hosts as distinct list entries", () => {
    const projects = buildHostedPluginProjects([
      {
        serverId: "host-a",
        hostLabel: "开发机",
        states: [appState("project-1", "2026-10-02T10:00:00.000Z")],
        options: [projectOption("project-1", "支付对账")],
      },
      {
        serverId: "host-b",
        hostLabel: "测试机",
        states: [appState("project-1", "2026-10-02T11:00:00.000Z")],
        options: [projectOption("project-1", "支付对账测试")],
      },
    ]);

    expect(projects.map((project) => project.key)).toEqual([
      "host-b\u0000project-1",
      "host-a\u0000project-1",
    ]);
    expect(projects.map((project) => project.hostLabel)).toEqual(["测试机", "开发机"]);
  });

  it("limits Project deletion to the plugin project's owning host", () => {
    expect(
      buildHostedPluginProjectRemoveTarget({
        serverId: "host-b",
        projectId: "project-1",
      }),
    ).toEqual({
      hosts: [{ serverId: "host-b", projectId: "project-1" }],
    });
  });

  it("defaults creation to the sole filtered host, then the current online host", () => {
    expect(
      resolvePluginProjectInitialHostId({
        visibleHostIds: ["host-b"],
        currentServerId: "host-a",
        onlineHostIds: new Set(["host-a", "host-b"]),
      }),
    ).toBe("host-b");
    expect(
      resolvePluginProjectInitialHostId({
        visibleHostIds: ["host-a", "host-b"],
        currentServerId: "host-b",
        onlineHostIds: new Set(["host-a", "host-b"]),
      }),
    ).toBe("host-b");
  });

  it("falls back to the first online filtered host and then the first filtered host", () => {
    expect(
      resolvePluginProjectInitialHostId({
        visibleHostIds: ["host-a", "host-b"],
        currentServerId: "host-c",
        onlineHostIds: new Set(["host-b"]),
      }),
    ).toBe("host-b");
    expect(
      resolvePluginProjectInitialHostId({
        visibleHostIds: ["host-a", "host-b"],
        currentServerId: "host-c",
        onlineHostIds: new Set(),
      }),
    ).toBe("host-a");
  });

  it("selects an explicitly requested Project on the current host before another host", () => {
    const projects = buildHostedPluginProjects([
      {
        serverId: "host-a",
        hostLabel: "开发机",
        states: [appState("project-1", "2026-10-02T10:00:00.000Z")],
        options: [projectOption("project-1", "开发项目")],
      },
      {
        serverId: "host-b",
        hostLabel: "测试机",
        states: [appState("project-1", "2026-10-02T11:00:00.000Z")],
        options: [projectOption("project-1", "测试项目")],
      },
    ]);

    expect(
      resolvePluginProjectSelectionKey({
        requestedProjectId: "project-1",
        preferredServerId: "host-a",
        currentKey: null,
        activeProject: null,
        projects,
      }),
    ).toBe(pluginProjectHostKey("host-a", "project-1"));
  });
});
