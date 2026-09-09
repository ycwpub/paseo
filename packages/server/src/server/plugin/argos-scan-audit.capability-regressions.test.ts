import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import {
  buildArgosGroupScanAudit,
  recoverArgosMessageFromScanAudit,
  writeArgosScanAudit,
} from "./argos-scan-audit.js";

const directories: string[] = [];

afterEach(async () => {
  await Promise.all(directories.splice(0).map((directory) => rm(directory, { recursive: true })));
});

describe("Argos scan audit", () => {
  it("persists the exact scanned message for deterministic ingestion retries", async () => {
    const cwd = await mkdtemp(path.join(tmpdir(), "paseo-argos-scan-audit-"));
    directories.push(cwd);
    const window = {
      start: new Date("2026-09-09T07:00:00.000Z"),
      end: new Date("2026-09-09T08:00:00.000Z"),
    };
    const message = {
      eventId: "history:om-1",
      messageId: "om-1",
      chatId: "oc-alerts",
      chatType: "group",
      messageType: "interactive",
      threadId: null,
      rootMessageId: null,
      openId: null,
      unionId: null,
      displayName: "Argos",
      topicName: "报警",
      text: [
        '<card title="[Argos-WARNING] 消费积压">',
        "服务: life.settle.demo",
        "https://cloud.bytedance.net/argos/alarm/detail/event/rule-42/alert-99",
      ].join("\n"),
      createTime: Date.parse("2026-09-09T07:30:00.000Z"),
    };
    const group = buildArgosGroupScanAudit({
      chatId: "oc-alerts",
      chatName: "Argos 报警群",
      window,
      messages: [message],
    });

    const auditFile = await writeArgosScanAudit({
      cwd,
      startedAt: new Date("2026-09-09T08:00:00.000Z"),
      finishedAt: new Date("2026-09-09T08:00:01.000Z"),
      window,
      groups: [group],
      failures: [],
    });

    expect(JSON.parse(await readFile(auditFile, "utf8"))).toMatchObject({
      totals: { scanned_messages: 1, matched_alerts: 1, failed_groups: 0 },
    });
    await expect(
      recoverArgosMessageFromScanAudit({ cwd, messageId: "om-1" }),
    ).resolves.toMatchObject({
      messageId: "om-1",
      chatId: "oc-alerts",
      text: message.text,
    });
  });
});
