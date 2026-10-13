import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, test } from "vitest";

import { LarkGroupMessageProcessorStore } from "./lark-group-message-processor-store.js";
import { LarkGroupMessageProcessorTaskStore } from "./lark-group-message-processor-task-store.js";

function createHome(): string {
  return mkdtempSync(path.join(os.tmpdir(), "paseo-lark-group-processor-"));
}

const processorInput = {
  name: "研发群自动答疑",
  enabled: true,
  botId: "bot-1",
  filters: [],
  aiFilterPrompt: "",
  replyPrompt: "结合上下文回答问题",
  target: {
    kind: "workspace" as const,
    cwd: "/tmp/project",
    workspaceId: null,
    projectId: null,
  },
};

describe("Lark group message processor stores", () => {
  test("persists processor defaults and state changes", () => {
    const home = createHome();
    const store = new LarkGroupMessageProcessorStore(home);
    const created = store.create(processorInput, "2026-10-13T00:00:00.000Z");

    expect(created).toMatchObject({
      name: "研发群自动答疑",
      realtime: { enabled: true, delaySeconds: 60 },
      scan: { enabled: true, intervalMinutes: 30, lookbackMinutes: 60 },
      context: { previousMessageCount: 10, followingMessageCount: 10 },
    });
    expect(store.setEnabled(created.id, false, "2026-10-13T00:01:00.000Z")?.enabled).toBe(false);
    expect(new LarkGroupMessageProcessorStore(home).get(created.id)?.enabled).toBe(false);
  });

  test("deduplicates tasks by processor and message across restarts", () => {
    const home = createHome();
    const store = new LarkGroupMessageProcessorTaskStore(home);
    const task = store.enqueue(
      {
        processorId: "processor-1",
        processorName: "研发群自动答疑",
        botId: "bot-1",
        source: "listener",
        chatId: "oc_research",
        chatName: "研发群",
        messageId: "om_1",
        senderOpenId: "ou_alice",
        senderName: "Alice",
        content: "如何排查失败？",
        scheduledAt: "2026-10-13T00:01:00.000Z",
      },
      "2026-10-13T00:00:00.000Z",
    );

    expect(store.hasMessage("processor-1", "om_1")).toBe(true);
    expect(
      new LarkGroupMessageProcessorTaskStore(home).enqueue(
        {
          processorId: "processor-1",
          processorName: "研发群自动答疑",
          botId: "bot-1",
          source: "scan",
          chatId: "oc_research",
          chatName: "研发群",
          messageId: "om_1",
          senderOpenId: "ou_alice",
          senderName: "Alice",
          content: "如何排查失败？",
          scheduledAt: null,
        },
        "2026-10-13T00:02:00.000Z",
      ).id,
    ).toBe(task.id);
    expect(
      JSON.parse(
        readFileSync(path.join(home, "channels", "lark-group-processor-tasks.json"), "utf8"),
      ).tasks,
    ).toHaveLength(1);
  });

  test("marks unfinished tasks failed after restart and supports retry", () => {
    const home = createHome();
    const store = new LarkGroupMessageProcessorTaskStore(home);
    const task = store.enqueue(
      {
        processorId: "processor-1",
        processorName: "研发群自动答疑",
        botId: "bot-1",
        source: "listener",
        chatId: "oc_research",
        chatName: "研发群",
        messageId: "om_1",
        senderOpenId: "ou_alice",
        senderName: "Alice",
        content: "如何排查失败？",
        scheduledAt: null,
      },
      "2026-10-13T00:00:00.000Z",
    );
    store.markRunning(task.id, "2026-10-13T00:01:00.000Z");

    const restarted = new LarkGroupMessageProcessorTaskStore(home);
    expect(restarted.get(task.id)).toMatchObject({
      status: "failed",
      failureStage: "processing",
      error: "Paseo daemon 重启前任务未完成",
    });
    expect(restarted.resetFailedForRetry([task.id], "2026-10-13T00:02:00.000Z")).toEqual([task.id]);
    expect(restarted.get(task.id)?.status).toBe("pending");
  });

  test("records a scan failure as a visible failed task", () => {
    const store = new LarkGroupMessageProcessorTaskStore(createHome());
    const task = store.recordOperationalFailure(
      {
        processorId: "processor-1",
        processorName: "研发群自动答疑",
        botId: "bot-1",
        source: "scan",
        stage: "scan",
        chatId: "oc_research",
        chatName: "研发群",
        error: "飞书接口读取群消息失败",
      },
      "2026-10-13T00:00:00.000Z",
    );

    expect(task).toMatchObject({
      status: "failed",
      source: "scan",
      failureStage: "scan",
      chatName: "研发群",
      error: "飞书接口读取群消息失败",
    });
  });
});
