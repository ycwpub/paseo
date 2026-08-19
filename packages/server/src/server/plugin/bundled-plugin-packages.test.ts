import { fileURLToPath } from "node:url";
import { describe, expect, it } from "vitest";
import { loadPluginMarketplace } from "./plugin-marketplace.js";
import { loadPluginPackage } from "./plugin-package.js";

const marketplacePath = fileURLToPath(
  new URL("../../../../../.agents/plugins/marketplace.json", import.meta.url),
);

describe("bundled plugin packages", () => {
  it("exposes the generic HTTP service and Agent web app plugins", () => {
    const marketplace = loadPluginMarketplace(marketplacePath);
    const entries = new Map(marketplace.plugins.map((entry) => [entry.name, entry]));

    expect([...entries.keys()]).toEqual([
      "workflow-http-service",
      "agent-web-app",
      "byte-development",
      "byte-reconciliation",
    ]);

    const httpEntry = entries.get("workflow-http-service");
    expect(httpEntry?.sourcePath).toBeDefined();
    const httpPlugin = loadPluginPackage(httpEntry!.sourcePath!);
    expect(httpPlugin.httpServices).toEqual([
      expect.objectContaining({
        name: "processor",
        port: 0,
        path: "/process",
      }),
    ]);
    expect(httpPlugin.apps).toEqual([
      expect.objectContaining({
        id: "service-console",
        category: "Infrastructure",
      }),
    ]);

    const appEntry = entries.get("agent-web-app");
    expect(appEntry?.sourcePath).toBeDefined();
    const appPlugin = loadPluginPackage(appEntry!.sourcePath!);
    expect(appPlugin.apps).toEqual([
      expect.objectContaining({
        id: "web-app-builder",
        category: "Productivity",
      }),
    ]);
  });
});
