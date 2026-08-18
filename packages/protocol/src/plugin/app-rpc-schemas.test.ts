import { describe, expect, it } from "vitest";
import {
  PluginAppActionSubmitRequestSchema,
  PluginAppGenerateRequestSchema,
  PluginAppGetResponseSchema,
} from "./app-rpc-schemas.js";

describe("plugin app RPC schemas", () => {
  it("accepts Agent interface generation requests", () => {
    expect(
      PluginAppGenerateRequestSchema.parse({
        type: "plugin.app.generate.request",
        requestId: "request-1",
        pluginId: "demo-plugin",
        appId: "dashboard",
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
});
