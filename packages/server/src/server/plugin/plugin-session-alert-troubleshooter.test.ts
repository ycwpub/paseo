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
      recordId: "rec_1",
    });

    expect(enqueueAlertTroubleshooterRecord).toHaveBeenCalledWith({
      pluginId: "argos-alert-troubleshooter",
      appId: "argos-troubleshooter-console",
      projectId: "prj_1",
      recordId: "rec_1",
    });
    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.enqueue_record.response",
      payload: {
        requestId: "request-1",
        queued: true,
        recordId: "rec_1",
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
      recordId: "rec_missing",
    });

    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.enqueue_record.response",
      payload: {
        requestId: "request-2",
        queued: false,
        recordId: "rec_missing",
        error: "record not found",
      },
    });
  });
});
