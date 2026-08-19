import { describe, expect, it } from "vitest";
import { selectBundledPluginSyncs } from "./bundled-plugin-sync.js";

describe("selectBundledPluginSyncs", () => {
  it("refreshes an installed bundled plugin even when its version is unchanged", () => {
    const marketplacePath =
      "/Applications/Paseo.app/Contents/Resources/.agents/plugins/marketplace.json";
    expect(
      selectBundledPluginSyncs({
        bundledMarketplacePaths: [marketplacePath],
        catalog: [
          {
            marketplaceFilePath: marketplacePath,
            marketplaceId: "bundled",
            pluginName: "workflow-http-service",
            version: "0.1.0",
          },
        ],
        installed: [
          {
            pluginId: "workflow-http-service",
            marketplaceId: "bundled",
            version: "0.1.0",
          },
        ],
      }),
    ).toEqual([
      expect.objectContaining({
        pluginName: "workflow-http-service",
        version: "0.1.0",
      }),
    ]);
  });

  it("does not refresh plugins installed from a different marketplace", () => {
    expect(
      selectBundledPluginSyncs({
        bundledMarketplacePaths: ["/bundled/marketplace.json"],
        catalog: [
          {
            marketplaceFilePath: "/user/marketplace.json",
            marketplaceId: "user",
            pluginName: "workflow-http-service",
            version: "0.1.0",
          },
        ],
        installed: [
          {
            pluginId: "workflow-http-service",
            marketplaceId: "user",
            version: "0.1.0",
          },
        ],
      }),
    ).toEqual([]);
  });
});
