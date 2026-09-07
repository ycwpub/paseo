import { mkdtempSync, readFileSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { describe, expect, it } from "vitest";
import { LarkSubstituteTaskStore } from "./lark-substitute-task-store.js";

function createStore() {
  return new LarkSubstituteTaskStore(mkdtempSync(path.join(os.tmpdir(), "paseo-sub-task-")));
}

const input = {
  modeId: "mode_1",
  modeName: "测试替身",
  botId: "bot_1",
  source: "group_listener" as const,
  chatId: "oc_chat",
  chatName: "研发群",
  messageId: "om_1",
  senderOpenId: "ou_user",
  senderName: "张三",
  content: "第一个问题",
  scheduledAt: "2026-09-07T06:10:00.000Z",
};

describe("LarkSubstituteTaskStore", () => {
  it("updates the pending task when a newer matched message arrives in the same group", () => {
    const store = createStore();
    const first = store.enqueue(input, "2026-09-07T06:00:00.000Z");
    const updated = store.enqueue(
      { ...input, messageId: "om_2", content: "最新问题" },
      "2026-09-07T06:01:00.000Z",
    );

    expect(updated.id).toBe(first.id);
    expect(store.list()).toHaveLength(1);
    expect(updated).toMatchObject({ messageId: "om_2", content: "最新问题" });
  });

  it("pauses only pending tasks and deletes selected tasks in one operation", () => {
    const store = createStore();
    const pending = store.enqueue(input, "2026-09-07T06:00:00.000Z");
    const running = store.enqueue(
      { ...input, chatId: "oc_other", messageId: "om_2" },
      "2026-09-07T06:01:00.000Z",
    );
    store.markRunning(running.id, "2026-09-07T06:02:00.000Z");

    expect(store.pause([pending.id, running.id], "2026-09-07T06:03:00.000Z")).toEqual([pending.id]);
    expect(store.get(pending.id)?.status).toBe("paused");
    expect(store.get(running.id)?.status).toBe("running");
    expect(store.deleteMany([pending.id, running.id])).toEqual([pending.id, running.id]);
    expect(store.list()).toEqual([]);
  });

  it("pauses pending tasks when their substitute mode is updated or disabled", () => {
    const store = createStore();
    const first = store.enqueue(input, "2026-09-07T06:00:00.000Z");
    const second = store.enqueue(
      { ...input, modeId: "mode_2", chatId: "oc_other", messageId: "om_2" },
      "2026-09-07T06:01:00.000Z",
    );

    expect(store.pausePendingForMode("mode_1", "2026-09-07T06:02:00.000Z")).toEqual([first.id]);
    expect(store.get(first.id)?.status).toBe("paused");
    expect(store.get(second.id)?.status).toBe("pending");
  });

  it("records private-message scan failures as failed tasks", () => {
    const store = createStore();
    const task = store.recordPrivateScanFailure(
      { modeId: "mode_1", modeName: "测试替身", botId: "bot_1" },
      "2026-09-07T06:05:00.000Z",
      "飞书用户 OAuth 缺少 im:message:readonly 权限",
    );

    expect(task).toMatchObject({
      source: "private_scan",
      status: "failed",
      failureStage: "private_scan",
      chatName: "授权用户私聊扫描",
      content: "扫描授权用户的新增私聊消息",
      error: "飞书用户 OAuth 缺少 im:message:readonly 权限",
    });

    const updated = store.recordPrivateScanFailure(
      { modeId: "mode_1", modeName: "测试替身", botId: "bot_1" },
      "2026-09-07T06:35:00.000Z",
      "用户授权已过期，请重新授权",
    );
    expect(updated.id).toBe(task.id);
    expect(store.list()).toHaveLength(1);
    expect(updated).toMatchObject({
      updatedAt: "2026-09-07T06:35:00.000Z",
      error: "用户授权已过期，请重新授权",
    });
  });

  it("records and deduplicates operational failures while preserving message tasks", () => {
    const store = createStore();
    const task = store.recordOperationalFailure(
      {
        modeId: "mode_1",
        modeName: "测试替身",
        botId: "bot_1",
        source: "group_scan",
        stage: "group_scan",
        chatId: "oc_chat",
        chatName: "研发群",
        error: "读取群消息失败",
      },
      "2026-09-07T06:05:00.000Z",
    );
    const updated = store.recordOperationalFailure(
      {
        modeId: "mode_1",
        modeName: "测试替身",
        botId: "bot_1",
        source: "group_scan",
        stage: "group_scan",
        chatId: "oc_chat",
        chatName: "研发群",
        error: "群消息读取权限不足",
      },
      "2026-09-07T06:35:00.000Z",
    );

    expect(updated.id).toBe(task.id);
    expect(updated).toMatchObject({
      status: "failed",
      failureStage: "group_scan",
      error: "群消息读取权限不足",
    });
    expect(store.list()).toHaveLength(1);

    const messageTask = store.enqueue(input, "2026-09-07T07:00:00.000Z");
    const failedMessageTask = store.recordOperationalFailure(
      {
        ...input,
        stage: "listener",
        error: "监听消息处理失败",
      },
      "2026-09-07T07:01:00.000Z",
    );
    expect(failedMessageTask.id).toBe(messageTask.id);
    expect(failedMessageTask).toMatchObject({
      status: "failed",
      failureStage: "listener",
      error: "监听消息处理失败",
    });
  });

  it("marks unfinished tasks failed after a daemon restart", () => {
    const home = mkdtempSync(path.join(os.tmpdir(), "paseo-sub-task-restart-"));
    const store = new LarkSubstituteTaskStore(home);
    const task = store.enqueue(input, "2026-09-07T06:00:00.000Z");
    store.markRunning(task.id, "2026-09-07T06:01:00.000Z");

    const restarted = new LarkSubstituteTaskStore(home);
    expect(restarted.get(task.id)).toMatchObject({
      status: "failed",
      failureStage: "processing",
      error: "Paseo daemon 重启前任务未完成",
    });
    expect(
      JSON.parse(readFileSync(path.join(home, "channels", "lark-substitute-tasks.json"), "utf8"))
        .tasks,
    ).toHaveLength(1);
  });
});
