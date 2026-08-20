import { describe, expect, it } from "vitest";
import {
  PluginAppActionSubmitRequestSchema,
  PluginAppGenerateRequestSchema,
  PluginAppGetRequestSchema,
  PluginAppGetResponseSchema,
  PluginAppJobDeleteRequestSchema,
  PluginAppJobListRequestSchema,
  PluginAppJobListResponseSchema,
  PluginAppJobUpdateRequestSchema,
  PluginHttpServiceSubmitRequestSchema,
} from "./app-rpc-schemas.js";

describe("plugin app RPC schemas", () => {
  it("accepts older Project-unaware app requests and state", () => {
    expect(
      PluginAppGetRequestSchema.parse({
        type: "plugin.app.get.request",
        requestId: "request-legacy",
        pluginId: "demo-plugin",
        appId: "dashboard",
      }).projectId,
    ).toBeUndefined();
    expect(
      PluginAppGetResponseSchema.parse({
        type: "plugin.app.get.response",
        payload: {
          requestId: "request-legacy",
          app: {
            pluginId: "demo-plugin",
            appId: "dashboard",
            document: null,
            conversation: [],
            createdAt: "2026-08-20T00:00:00.000Z",
            updatedAt: "2026-08-20T00:00:00.000Z",
          },
          error: null,
        },
      }).payload.app?.projectId,
    ).toBeUndefined();
  });

  it("accepts Agent interface generation requests", () => {
    expect(
      PluginAppGenerateRequestSchema.parse({
        type: "plugin.app.generate.request",
        requestId: "request-1",
        pluginId: "demo-plugin",
        appId: "dashboard",
        projectId: "project-1",
        prompt: "Build a form",
      }).prompt,
    ).toBe("Build a form");
  });

  it("accepts structured form submissions", () => {
    expect(
      PluginAppActionSubmitRequestSchema.parse({
        type: "plugin.app.action.submit.request",
        requestId: "request-2",
        pluginId: "demo-plugin",
        appId: "dashboard",
        projectId: "project-1",
        componentId: "submit",
        form: { question: "hello", count: 2 },
      }).form,
    ).toEqual({ question: "hello", count: 2 });
  });

  it("returns a declarative app document and conversation", () => {
    const response = PluginAppGetResponseSchema.parse({
      type: "plugin.app.get.response",
      payload: {
        requestId: "request-3",
        app: {
          pluginId: "demo-plugin",
          appId: "dashboard",
          projectId: "project-1",
          document: {
            version: 1,
            title: "Dashboard",
            components: [{ id: "title", type: "heading", text: "Hello" }],
          },
          conversation: [],
          createdAt: "2026-08-18T10:00:00.000Z",
          updatedAt: "2026-08-18T10:00:00.000Z",
        },
        error: null,
      },
    });
    expect(response.payload.app?.document?.title).toBe("Dashboard");
  });

  it("lists plugin jobs by project", () => {
    expect(
      PluginAppJobListRequestSchema.parse({
        type: "plugin.app.job.list.request",
        requestId: "request-4",
        pluginId: "byte-development",
        serviceName: "development",
        projectId: "project-1",
        limit: 50,
        filters: {
          statuses: ["succeeded", "failed"],
          listenerId: "listener-1",
          createdBefore: "2026-08-20T10:00:00.000Z",
        },
      }),
    ).toMatchObject({
      projectId: "project-1",
      limit: 50,
      filters: { listenerId: "listener-1" },
    });

    expect(
      PluginAppJobListResponseSchema.parse({
        type: "plugin.app.job.list.response",
        payload: {
          requestId: "request-4",
          jobs: [],
          error: null,
        },
      }).payload.jobs,
    ).toEqual([]);
  });

  it("updates and deletes persisted plugin jobs", () => {
    expect(
      PluginAppJobUpdateRequestSchema.parse({
        type: "plugin.app.job.update.request",
        requestId: "request-5",
        processId: "process-1",
        input: { flow_title: "更新后的流程" },
      }).input,
    ).toEqual({ flow_title: "更新后的流程" });
    expect(
      PluginAppJobDeleteRequestSchema.parse({
        type: "plugin.app.job.delete.request",
        requestId: "request-6",
        processId: "process-1",
      }).processId,
    ).toBe("process-1");
  });

  it("submits an installed plugin HTTP service directly", () => {
    expect(
      PluginHttpServiceSubmitRequestSchema.parse({
        type: "plugin.http.submit.request",
        requestId: "request-7",
        pluginId: "byte-development",
        serviceName: "meego-source",
        input: { action: "list" },
      }),
    ).toMatchObject({
      pluginId: "byte-development",
      serviceName: "meego-source",
      input: { action: "list" },
    });
  });
});
