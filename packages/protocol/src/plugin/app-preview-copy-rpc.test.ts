import { describe, expect, it } from "vitest";
import {
  PluginAppHtmlPreviewGetRequestSchema,
  PluginAppHtmlPreviewGetResponseSchema,
  PluginAppProjectCopyRequestSchema,
  PluginAppProjectCopyResponseSchema,
} from "./app-rpc-schemas.js";

describe("plugin app preview and copy RPC schemas", () => {
  it("parses an HTML preview request and response", () => {
    expect(
      PluginAppHtmlPreviewGetRequestSchema.parse({
        type: "plugin.app.html-preview.get.request",
        requestId: "preview-request",
        pluginId: "agent-web-app",
        appId: "web-app-builder",
        projectId: "project-1",
      }).projectId,
    ).toBe("project-1");

    expect(
      PluginAppHtmlPreviewGetResponseSchema.parse({
        type: "plugin.app.html-preview.get.response",
        payload: {
          requestId: "preview-request",
          html: "<!doctype html><title>计算器</title>",
          htmlPath: "/tmp/preview.html",
          error: null,
        },
      }).payload.htmlPath,
    ).toBe("/tmp/preview.html");
  });

  it("parses a plugin project copy request and response", () => {
    expect(
      PluginAppProjectCopyRequestSchema.parse({
        type: "plugin.app.project.copy.request",
        requestId: "copy-request",
        pluginId: "agent-web-app",
        appId: "web-app-builder",
        sourceProjectId: "project-1",
        targetProjectId: "project-2",
      }).targetProjectId,
    ).toBe("project-2");

    expect(
      PluginAppProjectCopyResponseSchema.parse({
        type: "plugin.app.project.copy.response",
        payload: {
          requestId: "copy-request",
          app: null,
          error: "复制失败",
        },
      }).payload.error,
    ).toBe("复制失败");
  });
});
