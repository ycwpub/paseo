import { mkdtempSync, rmSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { PluginHttpConfigStore } from "./plugin-http-config-store.js";

describe("PluginHttpConfigStore", () => {
  let tempRoot: string | null = null;

  afterEach(() => {
    if (tempRoot) rmSync(tempRoot, { recursive: true, force: true });
    tempRoot = null;
  });

  it("persists project-scoped multi-listener configurations", () => {
    tempRoot = mkdtempSync(path.join(os.tmpdir(), "paseo-plugin-http-config-"));
    const directory = path.join(tempRoot, "configs");
    const store = new PluginHttpConfigStore(directory);
    store.initialize();
    store.save({
      version: 1,
      pluginId: "workflow-http-service",
      projectId: "project-1",
      listeners: [
        {
          id: "listener-1",
          name: "服务 A",
          enabled: true,
          host: "127.0.0.1",
          port: 8088,
          routes: [],
          retention: {
            enabled: false,
            maxAgeSeconds: 3600,
            statuses: ["succeeded"],
          },
        },
        {
          id: "listener-2",
          name: "服务 B",
          enabled: false,
          host: "127.0.0.1",
          port: 8089,
          routes: [],
          retention: {
            enabled: true,
            maxAgeSeconds: 7200,
            statuses: ["failed"],
          },
        },
      ],
      updatedAt: "2026-08-20T10:00:00.000Z",
    });

    const reloaded = new PluginHttpConfigStore(directory);
    reloaded.initialize();
    expect(reloaded.get("workflow-http-service", "project-1")?.listeners).toHaveLength(2);
  });
});
