import { describe, expect, it } from "vitest";
import { AlertTroubleshooterConfigSchema } from "./alert-troubleshooter-types.js";

function config(autoArchiveAgents?: boolean) {
  return AlertTroubleshooterConfigSchema.parse({
    botId: "bot-1",
    chats: [{ chatId: "oc_alerts", name: "报警群" }],
    target: { kind: "default" },
    troubleshootingSopDoc: "https://example.com/wiki/sop",
    attributionRecordRoot: "https://example.com/wiki/records",
    ...(autoArchiveAgents === undefined ? {} : { autoArchiveAgents }),
  });
}

describe("alert troubleshooter agent auto-archive compatibility", () => {
  it("keeps existing saved configurations opted out", () => {
    expect(config().autoArchiveAgents).toBe(false);
  });

  it("preserves an explicit automatic archive preference", () => {
    expect(config(true).autoArchiveAgents).toBe(true);
  });
});
