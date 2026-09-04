import { afterEach, describe, expect, test, vi } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";
import { LarkSubstituteDebouncer } from "./lark-substitute-debounce.js";

function mode(overrides: Partial<LarkSubstituteMode> = {}): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "工作替身",
    enabled: true,
    botId: "bot-1",
    substituteUser: { openId: "ou_target", name: "张三", email: "a@example.com" },
    privateReplyIdentity: "user",
    groupReplyIdentity: "bot",
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "",
    delaySeconds: 2,
    activeTimeRanges: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: "gpt-5.5",
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-04T00:00:00.000Z",
    updatedAt: "2026-09-04T00:00:00.000Z",
    ...overrides,
  };
}

function event(messageId: string, text: string): NormalizedLarkMessageEvent {
  return {
    eventId: `event-${messageId}`,
    messageId,
    chatId: "oc_group",
    chatType: "group",
    threadId: null,
    rootMessageId: null,
    openId: "ou_sender",
    unionId: null,
    displayName: "李四",
    topicName: null,
    text,
    createTime: Date.now(),
    mentions: [],
  };
}

function eventFrom(messageId: string, text: string, openId: string): NormalizedLarkMessageEvent {
  return { ...event(messageId, text), openId };
}

afterEach(() => {
  vi.useRealTimers();
});

describe("LarkSubstituteDebouncer", () => {
  test("keeps only the latest message received during the configured delay", async () => {
    vi.useFakeTimers();
    const debouncer = new LarkSubstituteDebouncer();
    const handler = vi.fn(async () => undefined);

    expect(debouncer.schedule(mode(), event("om_1", "第一段"), handler)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_000);
    expect(debouncer.schedule(mode(), event("om_2", "完整问题"), handler)).toBe(true);
    await vi.advanceTimersByTimeAsync(1_999);
    expect(handler).not.toHaveBeenCalled();
    await vi.advanceTimersByTimeAsync(1);

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ messageId: "om_2" }));
  });

  test("can cancel a pending mode and bypasses scheduling when delay is zero", async () => {
    vi.useFakeTimers();
    const debouncer = new LarkSubstituteDebouncer();
    const handler = vi.fn(async () => undefined);

    debouncer.schedule(mode(), event("om_1", "问题"), handler);
    debouncer.cancelMode("mode-1");
    await vi.runAllTimersAsync();
    expect(handler).not.toHaveBeenCalled();
    expect(debouncer.schedule(mode({ delaySeconds: 0 }), event("om_2", "立即处理"), handler)).toBe(
      false,
    );
  });

  test("does not let another group member replace a pending question", async () => {
    vi.useFakeTimers();
    const debouncer = new LarkSubstituteDebouncer();
    const handler = vi.fn(async () => undefined);

    debouncer.schedule(mode(), eventFrom("om_1", "用户一的问题", "ou_user_1"), handler);
    debouncer.schedule(mode(), eventFrom("om_2", "用户二的问题", "ou_user_2"), handler);
    await vi.runAllTimersAsync();

    expect(handler).toHaveBeenCalledTimes(2);
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ messageId: "om_1" }));
    expect(handler).toHaveBeenCalledWith(expect.objectContaining({ messageId: "om_2" }));
  });
});
