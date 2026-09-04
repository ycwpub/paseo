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
      excludeRecentMinutes: 30,
    });
    expect(config.chats).toHaveLength(2);
  });
});
