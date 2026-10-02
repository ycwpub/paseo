import { describe, expect, it } from "vitest";
import type { PluginAppState } from "@getpaseo/protocol/messages";
import { configurePluginProjectOnHost } from "./plugin-project-host-actions";

function appState(serverId: string): PluginAppState {
  return {
    pluginId: "demo",
    appId: "console",
    projectId: "project-1",
    name: serverId,
    defaultAgent: { provider: "codex", model: "gpt-5.6" },
    knowledge: "",
    data: {},
    document: null,
    conversation: [],
    createdAt: "2026-10-02T00:00:00.000Z",
    updatedAt: "2026-10-02T00:00:00.000Z",
  };
}

describe("plugin project host actions", () => {
  it("creates the plugin project through the explicitly selected host", async () => {
    const result = await configurePluginProjectOnHost({
      serverId: "host-b",
      pluginId: "demo",
      appId: "console",
      projectId: "project-1",
      defaultAgent: { provider: "codex", model: "gpt-5.6" },
      getClient: (serverId) =>
        serverId === "host-b"
          ? {
              configurePluginApp: async () => ({
                app: appState("host-b"),
                error: null,
              }),
            }
          : null,
    });

    expect(result.name).toBe("host-b");
  });

  it("reports the selected host as unavailable instead of falling back to another host", async () => {
    await expect(
      configurePluginProjectOnHost({
        serverId: "host-b",
        pluginId: "demo",
        appId: "console",
        projectId: "project-1",
        defaultAgent: { provider: "codex", model: "gpt-5.6" },
        getClient: () => null,
      }),
    ).rejects.toThrow("所选主机未连接或插件不可用");
  });
});
