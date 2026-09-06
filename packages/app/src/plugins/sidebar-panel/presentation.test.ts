import { describe, expect, it } from "vitest";
import type { PluginSummary } from "@getpaseo/protocol/messages";
import { resolvePluginLauncherIcon } from "./presentation";

function plugin(overrides: Partial<PluginSummary> = {}): PluginSummary {
  return {
    id: "installed:example",
    pluginId: "example",
    name: "example",
    displayName: "Example",
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
    ...overrides,
  };
}

describe("plugin sidebar presentation", () => {
  it("uses the icon declared by the plugin app", () => {
    expect(
      resolvePluginLauncherIcon(
        plugin({
          apps: [{ id: "main", icon: "Blocks" }],
        }),
      ),
    ).toBe("Blocks");
  });

  it("derives a semantic icon from plugin capabilities", () => {
    expect(
      resolvePluginLauncherIcon(
        plugin({
          pluginId: "workflow-http-service",
          displayName: "HTTP 服务",
        }),
      ),
    ).toBe("Webhook");
    expect(
      resolvePluginLauncherIcon(
        plugin({
          pluginId: "byte-development",
          displayName: "字节开发",
        }),
      ),
    ).toBe("Code2");
  });

  it("uses a neutral plugin icon when no semantic rule matches", () => {
    expect(resolvePluginLauncherIcon(plugin())).toBe("Puzzle");
  });

  it("supports legacy plugin summaries that omit app metadata", () => {
    const legacy = { ...plugin(), apps: undefined } as unknown as PluginSummary;
    expect(resolvePluginLauncherIcon(legacy)).toBe("Puzzle");
  });
});
