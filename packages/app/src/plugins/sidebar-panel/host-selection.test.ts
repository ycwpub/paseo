import { describe, expect, it } from "vitest";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import {
  prioritizePluginSidebarHosts,
  selectPluginSidebarHost,
} from "@/plugins/sidebar-panel/host-selection";

function plugin(displayName: string): PluginSummary {
  return {
    id: `installed:${displayName}`,
    pluginId: displayName.toLowerCase(),
    name: displayName.toLowerCase(),
    displayName,
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
    apps: [],
    unsupportedComponents: [],
    warnings: [],
  };
}

describe("plugin sidebar host selection", () => {
  it("prioritizes the current host, then the local daemon, then other connected hosts", () => {
    expect(prioritizePluginSidebarHosts("remote", "local", ["local", "remote", "other"])).toEqual([
      "remote",
      "local",
      "other",
    ]);
  });

  it("falls back to the local daemon when the current remote host has no plugins", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [] },
        { serverId: "local", plugins: [plugin("Local plugin")] },
      ])?.serverId,
    ).toBe("local");
  });

  it("keeps the current host when it has an installed plugin", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [plugin("Remote plugin")] },
        { serverId: "local", plugins: [plugin("Local plugin")] },
      ])?.serverId,
    ).toBe("remote");
  });

  it("uses another connected host only after current and local hosts are empty", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [] },
        { serverId: "local", plugins: [] },
        { serverId: "other", plugins: [plugin("Other plugin")] },
      ])?.serverId,
    ).toBe("other");
  });

  it("hides the section only when every candidate host has no installed plugins", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [] },
        { serverId: "local", plugins: [] },
      ]),
    ).toBeNull();
  });
});
