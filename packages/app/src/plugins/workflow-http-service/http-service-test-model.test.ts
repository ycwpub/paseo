import { describe, expect, it } from "vitest";
import type { PluginHttpListener } from "@getpaseo/protocol/messages";
import {
  buildHttpServiceTestOptions,
  parseHttpServiceTestBody,
  resolveHttpServiceTestTarget,
} from "./http-service-test-model";

const listener: PluginHttpListener = {
  id: "listener-1",
  name: "测试端口",
  enabled: true,
  host: "127.0.0.1",
  port: 0,
  defaultJobApi: {
    enabled: true,
    submitPath: "/jobs",
    queryPath: "/jobs",
    deletePath: "/jobs",
    workflowPath: "/tmp/workflow.json",
    requestTemplate: "",
    responseTemplate: "",
  },
  routes: [
    {
      id: "review",
      name: "审核",
      enabled: true,
      method: "POST",
      path: "/review",
      requestTemplate: "",
      responseTemplate: "",
      workflowPath: "/tmp/review.json",
      maxBodyBytes: 1024,
    },
  ],
  retention: {
    enabled: false,
    maxAgeSeconds: 3600,
    statuses: ["succeeded"],
  },
};

describe("HTTP service test model", () => {
  it("builds standard and custom endpoint options", () => {
    expect(buildHttpServiceTestOptions(listener).map((option) => option.label)).toEqual([
      "POST /jobs",
      "GET /jobs?request_id=...",
      "DELETE /jobs?request_id=...",
      "POST /review",
    ]);
  });

  it("resolves targets and validates request IDs", () => {
    expect(resolveHttpServiceTestTarget("default-submit", "")).toEqual({
      kind: "default_submit",
    });
    expect(resolveHttpServiceTestTarget("route:review", "")).toEqual({
      kind: "route",
      routeId: "review",
    });
    expect(() => resolveHttpServiceTestTarget("default-query", "")).toThrow("请求 ID");
  });

  it("accepts only JSON objects as request bodies", () => {
    expect(parseHttpServiceTestBody('{"question":"hello"}')).toEqual({ question: "hello" });
    expect(parseHttpServiceTestBody("")).toEqual({});
    expect(() => parseHttpServiceTestBody("[]")).toThrow("JSON object");
  });
});
