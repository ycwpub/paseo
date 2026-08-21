import { describe, expect, it } from "vitest";
import type { PluginAppState, PluginHttpProjectConfig } from "@getpaseo/protocol/messages";
import { buildCopiedPluginAppState } from "./plugin-app-project-copy.js";
import { buildCopiedPluginHttpProjectConfig } from "./plugin-http-project-copy.js";

describe("plugin project copy", () => {
  it("copies the page and default Agent without copying plugin-page conversation", () => {
    const source: PluginAppState = {
      pluginId: "agent-web-app",
      appId: "web-app-builder",
      projectId: "project-1",
      defaultAgent: { provider: "codex", model: "gpt-5.6" },
      document: {
        version: 1,
        title: "计算器",
        components: [{ id: "result", type: "result", label: "结果" }],
      },
      htmlPath: "/old/preview.html",
      conversation: [
        {
          id: "message-1",
          role: "user",
          content: "生成计算器",
          createdAt: "2026-08-21T00:00:00.000Z",
        },
      ],
      createdAt: "2026-08-21T00:00:00.000Z",
      updatedAt: "2026-08-21T00:00:00.000Z",
    };

    const copied = buildCopiedPluginAppState({
      source,
      targetProjectId: "project-2",
      timestamp: "2026-08-21T01:00:00.000Z",
    });

    expect(copied).toMatchObject({
      projectId: "project-2",
      defaultAgent: source.defaultAgent,
      document: source.document,
      conversation: [],
      createdAt: "2026-08-21T01:00:00.000Z",
      updatedAt: "2026-08-21T01:00:00.000Z",
    });
    expect(copied.htmlPath).toBeUndefined();
  });

  it("disables copied HTTP listeners to avoid port conflicts", () => {
    const source: PluginHttpProjectConfig = {
      version: 1,
      pluginId: "workflow-http-service",
      projectId: "project-1",
      listeners: [
        {
          id: "listener-1",
          name: "计算服务",
          host: "127.0.0.1",
          port: 8088,
          enabled: true,
          routes: [],
          retention: {
            enabled: true,
            maxAgeSeconds: 7 * 24 * 60 * 60,
            statuses: ["succeeded", "failed"],
          },
        },
      ],
      updatedAt: "2026-08-21T00:00:00.000Z",
    };

    const copied = buildCopiedPluginHttpProjectConfig({
      source,
      targetProjectId: "project-2",
      timestamp: "2026-08-21T01:00:00.000Z",
    });

    expect(copied.projectId).toBe("project-2");
    expect(copied.listeners[0]?.enabled).toBe(false);
  });
});
