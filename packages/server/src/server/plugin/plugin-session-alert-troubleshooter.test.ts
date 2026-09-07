import { describe, expect, it, vi } from "vitest";
import { createTestLogger } from "../../test-utils/test-logger.js";
import { PluginSession } from "./plugin-session.js";

describe("PluginSession alert troubleshooter RPC", () => {
  it("routes a manually selected Base record and returns its response", async () => {
    const emit = vi.fn();
    const enqueueAlertTroubleshooterRecord = vi.fn(async () => true);
    const session = new PluginSession({
      host: { emit },
      service: { enqueueAlertTroubleshooterRecord } as never,
      mcpStore: {} as never,
      skillStore: {} as never,
      logger: createTestLogger(),
    });

    await session.handleRequest({
      type: "plugin.alert_troubleshooter.enqueue_record.request",
      requestId: "request-1",
      pluginId: "argos-alert-troubleshooter",
      appId: "argos-troubleshooter-console",
      projectId: "prj_1",
      uniqueId: "result_id:1",
    });

    expect(enqueueAlertTroubleshooterRecord).toHaveBeenCalledWith({
      pluginId: "argos-alert-troubleshooter",
      appId: "argos-troubleshooter-console",
      projectId: "prj_1",
      uniqueId: "result_id:1",
    });
    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.enqueue_record.response",
      payload: {
        requestId: "request-1",
        queued: true,
        uniqueId: "result_id:1",
        error: null,
      },
    });
  });

  it("returns an RPC error instead of leaving the client waiting", async () => {
    const emit = vi.fn();
    const session = new PluginSession({
      host: { emit },
      service: {
        enqueueAlertTroubleshooterRecord: vi.fn(async () => {
          throw new Error("record not found");
        }),
      } as never,
      mcpStore: {} as never,
      skillStore: {} as never,
      logger: createTestLogger(),
    });

    await session.handleRequest({
      type: "plugin.alert_troubleshooter.enqueue_record.request",
      requestId: "request-2",
      pluginId: "argos-alert-troubleshooter",
      appId: "argos-troubleshooter-console",
      projectId: "prj_1",
      uniqueId: "result_id:missing",
    });

    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.enqueue_record.response",
      payload: {
        requestId: "request-2",
        queued: false,
        uniqueId: "result_id:missing",
        error: "record not found",
      },
    });
  });
});
