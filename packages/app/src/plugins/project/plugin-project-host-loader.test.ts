import { describe, expect, it } from "vitest";
import type { PluginAppState, PluginSummary } from "@getpaseo/protocol/messages";
import { loadPluginProjectHosts } from "./plugin-project-host-loader";

const APP_STATE: PluginAppState = {
  pluginId: "demo",
  appId: "console",
  projectId: "project-1",
  defaultAgent: { provider: "codex", model: "gpt-5.6" },
  knowledge: "",
  data: {},
  document: null,
  conversation: [],
  createdAt: "2026-10-02T00:00:00.000Z",
  updatedAt: "2026-10-02T00:00:00.000Z",
};

function plugin(pluginId: string, appId: string): PluginSummary {
  return {
    id: `installed:${pluginId}`,
    pluginId,
    name: pluginId,
    displayName: pluginId,
    version: "1.0.0",
    description: "",
    keywords: [],
    sourceType: "local",
    installed: true,
    enabled: true,
    installable: false,
    updateAvailable: false,
    skills: [],
    mcpServers: [],
    httpServices: [],
    apps: [{ id: appId }],
    unsupportedComponents: [],
    warnings: [],
  };
}

describe("plugin project host loader", () => {
  it("loads projects only from hosts that expose the requested enabled plugin app", async () => {
    const clients = new Map([
      [
        "host-a",
        {
          listUnifiedPlugins: async () => ({
            plugins: [plugin("demo", "console")],
            marketplaces: [],
            error: null,
          }),
          listPluginAppProjects: async () => ({ projects: [APP_STATE], error: null }),
        },
      ],
      [
        "host-b",
        {
          listUnifiedPlugins: async () => ({
            plugins: [plugin("other", "console")],
            marketplaces: [],
            error: null,
          }),
          listPluginAppProjects: async () => {
            throw new Error("unreachable");
          },
        },
      ],
    ]);

    const result = await loadPluginProjectHosts({
      hosts: [
        { serverId: "host-a", label: "开发机", online: true },
        { serverId: "host-b", label: "测试机", online: true },
      ],
      pluginId: "demo",
      appId: "console",
      getClient: (serverId) => clients.get(serverId) ?? null,
    });

    expect(result.availableHostIds).toEqual(["host-a"]);
    expect(result.sources).toEqual([
      { serverId: "host-a", hostLabel: "开发机", states: [APP_STATE] },
    ]);
    expect(result.hostErrors).toEqual([]);
  });

  it("keeps successful hosts when another selected host is offline or fails", async () => {
    const result = await loadPluginProjectHosts({
      hosts: [
        { serverId: "host-a", label: "开发机", online: true },
        { serverId: "host-b", label: "测试机", online: true },
        { serverId: "host-c", label: "离线机", online: false },
      ],
      pluginId: "demo",
      appId: "console",
      getClient: (serverId) => {
        if (serverId === "host-a") {
          return {
            listUnifiedPlugins: async () => ({
              plugins: [plugin("demo", "console")],
              marketplaces: [],
              error: null,
            }),
            listPluginAppProjects: async () => ({ projects: [APP_STATE], error: null }),
          };
        }
        if (serverId === "host-b") {
          return {
            listUnifiedPlugins: async () => {
              throw new Error("连接被重置");
            },
            listPluginAppProjects: async () => ({ projects: [], error: null }),
          };
        }
        return null;
      },
    });

    expect(result.sources).toHaveLength(1);
    expect(result.hostErrors).toEqual([
      { serverId: "host-b", hostLabel: "测试机", message: "连接被重置" },
      { serverId: "host-c", hostLabel: "离线机", message: "主机离线" },
    ]);
  });
});
