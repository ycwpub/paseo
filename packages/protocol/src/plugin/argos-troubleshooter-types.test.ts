import { describe, expect, it } from "vitest";
import { ArgosTroubleshooterConfigSchema } from "./argos-troubleshooter-types.js";

describe("ArgosTroubleshooterConfigSchema", () => {
  it("accepts multiple groups and the default two-hour compensation window", () => {
    const config = ArgosTroubleshooterConfigSchema.parse({
      botId: "bot-1",
      chats: [{ chatId: "oc_one" }, { chatId: "oc_two", name: "告警群" }],
      target: { kind: "assistant", assistantId: "assistant-1" },
      troubleshootingSopDoc: "https://example.com/wiki/sop",
      attributionRecordRoot: "https://example.com/wiki/records",
    });

    expect(config.schedule).toEqual({
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 120,
      excludeRecentMinutes: 0,
    });
    expect(config).toMatchObject({
      version: 3,
      listenEnabled: true,
      troubleshootingEnabled: true,
      recordTableUrl: "https://example.com/wiki/records",
      promptTemplate: "",
      queuePollIntervalMinutes: 5,
    });
    expect(config.chats).toHaveLength(2);
  });

  it("migrates the old 30-minute exclusion default to zero", () => {
    const config = ArgosTroubleshooterConfigSchema.parse({
      version: 1,
      botId: "bot-1",
      chats: [{ chatId: "oc_one" }],
      troubleshootingSopDoc: "https://example.com/wiki/sop",
      attributionRecordRoot: "https://example.com/wiki/records",
      schedule: {
        enabled: true,
        intervalMinutes: 30,
        lookbackMinutes: 120,
        excludeRecentMinutes: 30,
      },
    });

    expect(config.version).toBe(3);
    expect(config.schedule.excludeRecentMinutes).toBe(0);
  });

  it("migrates version 2 while preserving its zero-minute exclusion", () => {
    const config = ArgosTroubleshooterConfigSchema.parse({
      version: 2,
      botId: "bot-1",
      chats: [{ chatId: "oc_one" }],
      troubleshootingSopDoc: "https://example.com/wiki/sop",
      attributionRecordRoot: "https://example.com/base/records?table=tbl_records",
      schedule: {
        enabled: false,
        intervalMinutes: 60,
        lookbackMinutes: 180,
        excludeRecentMinutes: 0,
      },
    });

    expect(config).toMatchObject({
      version: 3,
      listenEnabled: true,
      troubleshootingEnabled: true,
      recordTableUrl: "https://example.com/base/records?table=tbl_records",
      promptTemplate: "",
      queuePollIntervalMinutes: 5,
      schedule: {
        enabled: false,
        intervalMinutes: 60,
        lookbackMinutes: 180,
        excludeRecentMinutes: 0,
      },
    });
  });
});
