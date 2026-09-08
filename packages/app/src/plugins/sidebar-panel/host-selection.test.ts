import { describe, expect, it } from "vitest";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import {
  prioritizePluginSidebarHosts,
  projectPluginSidebarCatalogs,
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

  it("keeps cached plugins in the catalog while a host reconnects", () => {
    expect(
      projectPluginSidebarCatalogs(
        ["local"],
        [{ plugins: [plugin("Local plugin")], marketplaces: [] }],
        new Set(),
      ),
    ).toEqual([
      {
        serverId: "local",
        plugins: [plugin("Local plugin")],
        online: false,
      },
    ]);
  });

  it("falls back to the local daemon when the current remote host has no plugins", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [], online: true },
        { serverId: "local", plugins: [plugin("Local plugin")], online: true },
      ])?.serverId,
    ).toBe("local");
  });

  it("keeps the current host when it has an installed plugin", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [plugin("Remote plugin")], online: true },
        { serverId: "local", plugins: [plugin("Local plugin")], online: true },
      ])?.serverId,
    ).toBe("remote");
  });

  it("uses another connected host only after current and local hosts are empty", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [], online: true },
        { serverId: "local", plugins: [], online: true },
        { serverId: "other", plugins: [plugin("Other plugin")], online: true },
      ])?.serverId,
    ).toBe("other");
  });

  it("prefers an online host over a higher-priority host with only cached plugins", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [plugin("Remote plugin")], online: false },
        { serverId: "local", plugins: [plugin("Local plugin")], online: true },
      ])?.serverId,
    ).toBe("local");
  });

  it("keeps the highest-priority cached catalog while every host reconnects", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [plugin("Remote plugin")], online: false },
        { serverId: "local", plugins: [plugin("Local plugin")], online: false },
      ])?.serverId,
    ).toBe("remote");
  });

  it("hides the section only when every candidate host has no installed plugins", () => {
    expect(
      selectPluginSidebarHost([
        { serverId: "remote", plugins: [], online: false },
        { serverId: "local", plugins: [], online: true },
      ]),
    ).toBeNull();
  });
});
