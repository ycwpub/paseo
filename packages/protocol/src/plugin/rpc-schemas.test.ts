import { describe, expect, it } from "vitest";
import {
  PluginInstallRequestSchema,
  PluginListResponseSchema,
  PluginSetEnabledRequestSchema,
} from "./rpc-schemas.js";

describe("plugin RPC schemas", () => {
  it("accepts local and marketplace installs", () => {
    expect(
      PluginInstallRequestSchema.parse({
        type: "plugin.install.request",
        requestId: "req-local",
        source: { type: "local", path: "/tmp/demo-plugin" },
      }).source,
    ).toEqual({ type: "local", path: "/tmp/demo-plugin" });
    expect(
      PluginInstallRequestSchema.parse({
        type: "plugin.install.request",
        requestId: "req-marketplace",
        source: {
          type: "marketplace",
          marketplaceId: "marketplace-local",
          pluginName: "demo-plugin",
        },
      }).source,
    ).toEqual({
      type: "marketplace",
      marketplaceId: "marketplace-local",
      pluginName: "demo-plugin",
    });
  });

  it("keeps plugin enablement explicit", () => {
    expect(
      PluginSetEnabledRequestSchema.parse({
        type: "plugin.set_enabled.request",
        requestId: "req-enable",
        pluginId: "demo-plugin",
        enabled: false,
      }).enabled,
    ).toBe(false);
  });

  it("returns installed and available plugin state together", () => {
    const response = PluginListResponseSchema.parse({
      type: "plugin.list.response",
      payload: {
        requestId: "req-list",
        plugins: [],
        marketplaces: [],
        error: null,
      },
    });
    expect(response.payload).toMatchObject({
      plugins: [],
      marketplaces: [],
      error: null,
    });
  });
});
