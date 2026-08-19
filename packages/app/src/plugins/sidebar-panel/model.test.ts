import { beforeEach, describe, expect, it } from "vitest";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import {
  resolveInstalledPluginEntries,
  resolvePluginAppSelection,
} from "@/plugins/sidebar-panel/model";
import { usePluginAppPanelStore } from "@/plugins/sidebar-panel/selection-store";

function plugin(displayName: string, overrides: Partial<PluginSummary> = {}): PluginSummary {
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
    apps: [{ id: "main" }],
    unsupportedComponents: [],
    warnings: [],
    ...overrides,
  };
}

describe("plugin sidebar panel model", () => {
  beforeEach(() => {
    usePluginAppPanelStore.setState({ selection: null });
  });

  it("exposes every installed plugin and opens an app when one is enabled", () => {
    const entries = resolveInstalledPluginEntries([
      plugin("Zulu"),
      plugin("Alpha"),
      plugin("Disabled", { enabled: false }),
      plugin("Unavailable", { installed: false }),
      plugin("No app", { apps: [] }),
    ]);

    expect(entries.map((entry) => entry.plugin.displayName)).toEqual([
      "Alpha",
      "Disabled",
      "No app",
      "Zulu",
    ]);
    expect(entries.find((entry) => entry.plugin.displayName === "Alpha")?.app?.id).toBe("main");
    expect(entries.find((entry) => entry.plugin.displayName === "Disabled")?.app).toBeNull();
    expect(entries.find((entry) => entry.plugin.displayName === "No app")?.app).toBeNull();
  });

  it("opens, closes, and switches the selected plugin app", () => {
    const alpha = resolvePluginAppSelection(
      "server-a",
      resolveInstalledPluginEntries([plugin("Alpha")])[0]!,
    );
    const beta = resolvePluginAppSelection(
      "server-a",
      resolveInstalledPluginEntries([plugin("Beta")])[0]!,
    );

    usePluginAppPanelStore.getState().toggle(alpha);
    expect(usePluginAppPanelStore.getState().selection).toEqual(alpha);

    usePluginAppPanelStore.getState().toggle(alpha);
    expect(usePluginAppPanelStore.getState().selection).toBeNull();

    usePluginAppPanelStore.getState().toggle(alpha);
    usePluginAppPanelStore.getState().toggle(beta);
    expect(usePluginAppPanelStore.getState().selection).toEqual(beta);

    usePluginAppPanelStore.getState().close();
    expect(usePluginAppPanelStore.getState().selection).toBeNull();
  });
});
