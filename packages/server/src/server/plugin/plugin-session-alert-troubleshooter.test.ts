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
        resultId: null,
        error: null,
      },
    });
  });

  it("routes a Bamboo result_id debugging request", async () => {
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
      requestId: "request-result",
      pluginId: "bamboo-reconciliation-troubleshooter",
      appId: "bamboo-troubleshooter-console",
      projectId: "prj_1",
      resultId: "123456",
    });

    expect(enqueueAlertTroubleshooterRecord).toHaveBeenCalledWith({
      pluginId: "bamboo-reconciliation-troubleshooter",
      appId: "bamboo-troubleshooter-console",
      projectId: "prj_1",
      resultId: "123456",
    });
    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.enqueue_record.response",
      payload: {
        requestId: "request-result",
        queued: true,
        uniqueId: "result_id:123456",
        resultId: "123456",
        error: null,
      },
    });
  });

  it("routes a one-off scan range and returns the refreshed tasks", async () => {
    const emit = vi.fn();
    const scanAlertTroubleshooterNow = vi.fn(async () => ({
      matchedCount: 2,
      failureCount: 1,
      auditFile: "/tmp/manual-scan.json",
    }));
    const listAlertTroubleshooterTasks = vi.fn(() => []);
    const session = new PluginSession({
      host: { emit },
      service: { scanAlertTroubleshooterNow, listAlertTroubleshooterTasks } as never,
      mcpStore: {} as never,
      skillStore: {} as never,
      logger: createTestLogger(),
    });

    await session.handleRequest({
      type: "plugin.alert_troubleshooter.scan_now.request",
      requestId: "request-scan",
      pluginId: "bamboo-reconciliation-troubleshooter",
      appId: "bamboo-troubleshooter-console",
      projectId: "prj_1",
      lookbackMinutes: 120,
      excludeRecentMinutes: 1,
    });

    expect(scanAlertTroubleshooterNow).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.scan_now.request",
      requestId: "request-scan",
      pluginId: "bamboo-reconciliation-troubleshooter",
      appId: "bamboo-troubleshooter-console",
      projectId: "prj_1",
      lookbackMinutes: 120,
      excludeRecentMinutes: 1,
    });
    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.scan_now.response",
      payload: {
        requestId: "request-scan",
        tasks: [],
        matchedCount: 2,
        failureCount: 1,
        auditFile: "/tmp/manual-scan.json",
        error: null,
      },
    });
  });

  it("returns a one-off scan error instead of leaving the client waiting", async () => {
    const emit = vi.fn();
    const session = new PluginSession({
      host: { emit },
      service: {
        scanAlertTroubleshooterNow: vi.fn(async () => {
          throw new Error("扫描失败");
        }),
      } as never,
      mcpStore: {} as never,
      skillStore: {} as never,
      logger: createTestLogger(),
    });

    await session.handleRequest({
      type: "plugin.alert_troubleshooter.scan_now.request",
      requestId: "request-scan-error",
      pluginId: "bamboo-reconciliation-troubleshooter",
      appId: "bamboo-troubleshooter-console",
      projectId: "prj_1",
      lookbackMinutes: 120,
      excludeRecentMinutes: 1,
    });

    expect(emit).toHaveBeenCalledWith({
      type: "plugin.alert_troubleshooter.scan_now.response",
      payload: {
        requestId: "request-scan-error",
        tasks: [],
        matchedCount: 0,
        failureCount: 0,
        auditFile: null,
        error: "扫描失败",
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
        resultId: null,
        error: "record not found",
      },
    });
  });
});
