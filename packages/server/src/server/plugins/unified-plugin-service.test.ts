import { describe, expect, it } from "vitest";
import type { PluginState } from "@getpaseo/protocol/messages";
import { mergePluginState } from "./unified-plugin-service.js";

function emptyResourceState(): PluginState {
  return { plugins: [], marketplaces: [] };
}

describe("mergePluginState", () => {
  it("adds runtime-only plugins to the unified catalog", () => {
    const state = mergePluginState(emptyResourceState(), [
      {
        id: "runtime-only",
        path: "/plugins/runtime-only",
        enabled: true,
        status: "running",
        source: "directory",
      },
    ]);

    expect(state.plugins).toEqual([
      expect.objectContaining({
        id: "runtime:runtime-only",
        pluginId: "runtime-only",
        installed: true,
        runtime: expect.objectContaining({ status: "running" }),
      }),
    ]);
  });

  it("merges runtime code and declarative resources under one plugin ID", () => {
    const state = mergePluginState(
      {
        marketplaces: [],
        plugins: [
          {
            id: "installed:demo-plugin",
            pluginId: "demo-plugin",
            name: "demo-plugin",
            displayName: "Demo",
            version: "1.0.0",
            description: "Demo plugin",
            keywords: [],
            sourceType: "local",
            sourcePath: "/plugins/demo",
            installed: true,
            enabled: true,
            installable: false,
            updateAvailable: false,
            skills: ["review"],
            mcpServers: [],
            httpServices: [],
            apps: [],
            unsupportedComponents: [],
            warnings: [],
          },
        ],
      },
      [
        {
          id: "demo-plugin",
          path: "/plugins/demo",
          enabled: true,
          status: "failed",
          error: "runtime failed",
        },
      ],
    );

    expect(state.plugins).toHaveLength(1);
    expect(state.plugins[0]).toMatchObject({
      pluginId: "demo-plugin",
      skills: ["review"],
      runtime: { status: "failed", error: "runtime failed" },
      warnings: ["runtime failed"],
    });
  });
});
