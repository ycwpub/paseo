import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { buildBambooGroupScanAudit, writeBambooScanAudit } from "./bamboo-scan-audit.js";

const temporaryDirectories: string[] = [];

afterEach(async () => {
  await Promise.all(
    temporaryDirectories.splice(0).map((directory) => rm(directory, { recursive: true })),
  );
});

describe("Bamboo scan audit", () => {
  it("keeps raw messages and parsed Bamboo records while counting ignored messages", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "paseo-bamboo-scan-audit-"));
    temporaryDirectories.push(cwd);
    const window = {
      start: new Date("2026-09-09T00:00:00.000Z"),
      end: new Date("2026-09-09T01:00:00.000Z"),
    };
    const group = buildBambooGroupScanAudit({
      chatId: "oc_1",
      chatName: "报警群",
      window,
      messages: [
        {
          messageId: "om_alert",
          eventId: "evt_alert",
          chatId: "oc_1",
          openId: "ou_1",
          unionId: null,
          senderType: "user",
          messageType: "text",
          displayName: "用户 1",
          text: "Bamboo result_id: 19630485\nhttps://bamboo.bytedance.net/result-manage/?id=19630485",
          createTime: 1_788_912_000_000,
          rootMessageId: null,
          threadId: null,
          topicName: null,
          mentions: [],
        },
        {
          messageId: "om_other",
          eventId: "evt_other",
          chatId: "oc_1",
          openId: "ou_2",
          unionId: null,
          senderType: "user",
          messageType: "text",
          displayName: "用户 2",
          text: "普通群消息",
          createTime: 1_788_912_100_000,
          rootMessageId: null,
          threadId: null,
          topicName: null,
          mentions: [],
        },
      ],
    });
    const auditFile = await writeBambooScanAudit({
      cwd,
      startedAt: window.start,
      finishedAt: window.end,
      window,
      groups: [group],
      failures: [],
    });
    const audit = JSON.parse(await readFile(auditFile, "utf8")) as {
      totals: Record<string, number>;
      groups: Array<{ alerts: Array<{ resultId: string }> }>;
    };

    expect(audit.totals).toEqual({
      groups: 1,
      scanned_messages: 2,
      matched_alerts: 1,
      ignored_messages: 1,
      failed_groups: 0,
    });
    expect(audit.groups[0]?.alerts[0]?.resultId).toBe("19630485");
  });
});
