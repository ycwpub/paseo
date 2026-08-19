import { describe, expect, it } from "vitest";
import type { PluginHttpProjectConfig } from "@getpaseo/protocol/messages";
import {
  canDeleteHttpJob,
  createHttpListener,
  createHttpRoute,
  updateHttpListener,
} from "./http-service-model";

const config: PluginHttpProjectConfig = {
  version: 1,
  pluginId: "workflow-http-service",
  projectId: "project-1",
  listeners: [],
  updatedAt: "2026-08-20T00:00:00.000Z",
};

describe("HTTP service model", () => {
  it("creates unique listeners and routes", () => {
    const first = createHttpListener(config);
    const withFirst = { ...config, listeners: [first] };
    const second = createHttpListener(withFirst);
    expect([first.id, second.id]).toEqual(["listener-1", "listener-2"]);
    expect(createHttpRoute({ ...first, routes: [] }).id).toBe("route-1");
  });

  it("updates only the selected listener", () => {
    const first = createHttpListener(config);
    const second = { ...createHttpListener({ ...config, listeners: [first] }), id: "listener-2" };
    const updated = updateHttpListener(
      { ...config, listeners: [first, second] },
      second.id,
      (listener) => ({ ...listener, enabled: true }),
    );
    expect(updated.listeners.map((listener) => listener.enabled)).toEqual([false, true]);
  });

  it("protects active requests from deletion", () => {
    expect(canDeleteHttpJob("running")).toBe(false);
    expect(canDeleteHttpJob("queued")).toBe(false);
    expect(canDeleteHttpJob("failed")).toBe(true);
  });
});
