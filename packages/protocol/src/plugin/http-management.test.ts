import { describe, expect, it } from "vitest";
import {
  PluginHttpConfigSaveRequestSchema,
  PluginHttpJobDeleteManyRequestSchema,
} from "./http-management.js";

describe("plugin HTTP management schemas", () => {
  it("accepts multiple independently enabled listeners and routes", () => {
    const parsed = PluginHttpConfigSaveRequestSchema.parse({
      type: "plugin.http.config.save.request",
      requestId: "request-1",
      config: {
        version: 1,
        pluginId: "workflow-http-service",
        projectId: "project-1",
        listeners: [
          {
            id: "listener-1",
            name: "审核服务",
            enabled: true,
            host: "127.0.0.1",
            port: 8088,
            defaultJobApi: {
              enabled: true,
              submitPath: "/jobs",
              queryPath: "/jobs",
              deletePath: "/jobs",
              workflowPath: "/tmp/workflow.json",
            },
            routes: [
              {
                id: "review",
                name: "审核",
                path: "/review",
                workflowPath: "/tmp/workflow.json",
                targetNodeId: "review",
              },
            ],
          },
        ],
      },
    });
    expect(parsed.config.listeners[0]?.routes[0]?.handler).toEqual({
      mode: "workflow",
      workflowPath: "/tmp/workflow.json",
      targetNodeId: "review",
    });
  });

  it("accepts a custom Workflow node as the request handler", () => {
    const parsed = PluginHttpConfigSaveRequestSchema.parse({
      type: "plugin.http.config.save.request",
      requestId: "request-custom",
      config: {
        version: 1,
        pluginId: "workflow-http-service",
        projectId: "project-1",
        listeners: [
          {
            id: "listener-1",
            name: "自定义处理服务",
            enabled: true,
            host: "127.0.0.1",
            port: 8088,
            routes: [
              {
                id: "custom",
                name: "自定义节点",
                path: "/custom",
                handler: {
                  mode: "custom_node",
                  step: {
                    id: "bash",
                    type: "bash",
                    initialCommand: 'output={"data":{"ok":true}}',
                  },
                },
              },
            ],
          },
        ],
      },
    });

    expect(parsed.config.listeners[0]?.routes[0]?.handler.mode).toBe("custom_node");
  });

  it("limits batch deletion request size", () => {
    expect(
      PluginHttpJobDeleteManyRequestSchema.parse({
        type: "plugin.http.job.delete_many.request",
        requestId: "request-2",
        processIds: ["request-a", "request-b"],
      }).processIds,
    ).toHaveLength(2);
  });
});
