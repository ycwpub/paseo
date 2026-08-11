import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { AgentManager, AgentManagerEvent, ManagedAgent } from "../../agent/agent-manager.js";
import type { AgentStorage } from "../../agent/agent-storage.js";
import type { BoundCreateAgentCommand } from "../../agent/create-agent/create.js";
import type { AssistantStore } from "../../assistants/assistant-store.js";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import { LarkChannelService } from "./lark-channel-service.js";
import { LarkChannelStore } from "./lark-channel-store.js";
import type { NormalizedLarkMessageEvent } from "./lark-message-format.js";

function makeAgent(
  id: string,
  lifecycle: ManagedAgent["lifecycle"],
  lastError?: string,
): ManagedAgent {
  return {
    id,
    lifecycle,
    lastError,
    provider: "claude",
    cwd: "/repo",
    activeForegroundTurnId: null,
    persistence: null,
    config: { provider: "claude", cwd: "/repo" },
  } as ManagedAgent;
}

async function* emptyAgentStream(): AsyncGenerator<never, void, unknown> {
  // Vitest tests only need the run to be accepted; state transitions are
  // driven explicitly through handleAgentManagerEvent below.
}

describe("LarkChannelService", () => {
  let paseoHome: string;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-lark-service-"));
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  function createHarness() {
    const logger = pino({ level: "silent" });
    const store = new LarkChannelStore({ paseoHome, logger });
    const bot = store.configure({
      name: "Support bot",
      appId: "cli_test",
      appSecret: "secret",
      target: {
        kind: "workspace",
        provider: "claude",
        model: null,
        cwd: "/repo",
        workspaceId: null,
      },
    });
    store.setEnabled(bot.id, true);
    const pairing = store.upsertPendingPairing(bot.id, {
      openId: "ou_1",
      unionId: null,
      chatId: "oc_1",
      displayName: "Alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
    });
    store.approvePairing(bot.id, pairing.code, "2026-01-01T00:01:00.000Z");

    const lastMessages = new Map<string, string | null>();
    const agents = new Map<string, ManagedAgent>();
    const agentManager = {
      subscribe: vi.fn(() => () => undefined),
      getLastAssistantMessage: vi.fn(async (agentId: string) => lastMessages.get(agentId) ?? null),
      getAgent: vi.fn((agentId: string) => agents.get(agentId) ?? makeAgent(agentId, "idle")),
      tryRunOutOfBand: vi.fn(() => false),
      hasInFlightRun: vi.fn(() => false),
      replaceAgentRun: vi.fn(() => emptyAgentStream()),
      streamAgent: vi.fn(() => emptyAgentStream()),
    } as unknown as AgentManager;
    const agentStorage = {
      get: vi.fn(async () => null),
    } as unknown as AgentStorage;
    const adapter: LarkChannelClientAdapter = {
      testConnection: vi.fn(async () => null),
      startEvents: vi.fn(async () => ({ close: vi.fn() })),
      sendText: vi.fn(async () => undefined),
      replyToMessageInThread: vi.fn(async () => ({
        threadId: "omt_created",
        messageId: "om_ack",
      })),
      replyInThread: vi.fn(async () => undefined),
      getMessage: vi.fn(async () => null),
      listThreadMessages: vi.fn(async () => []),
    };
    const createAgent = vi.fn(async () => {
      const snapshot = makeAgent("agent-created", "idle");
      agents.set(snapshot.id, snapshot);
      return {
        snapshot,
        liveSnapshot: snapshot,
        background: true,
        initialPromptStarted: false,
        initialPromptError: null,
      };
    }) as unknown as BoundCreateAgentCommand;
    const assistantStore = {
      get: vi.fn(() => null),
    } as unknown as AssistantStore;
    const service = new LarkChannelService({
      store,
      adapter,
      agentManager,
      agentStorage,
      createAgent,
      assistantStore,
      logger,
      host: { emitStatusChanged: vi.fn() },
    });
    const emitAgentState = (agentId: string, lifecycle: ManagedAgent["lifecycle"]) =>
      (
        service as unknown as {
          handleAgentManagerEvent(event: AgentManagerEvent): Promise<void>;
        }
      ).handleAgentManagerEvent({
        type: "agent_state",
        agent: makeAgent(agentId, lifecycle),
      });

    return {
      adapter,
      agentManager,
      botId: bot.id,
      createAgent,
      emitAgentState,
      lastMessages,
      service,
      store,
    };
  }

  test("uses a thread root message as the reply anchor for existing Lark topics", async () => {
    const harness = createHarness();
    harness.store.recordThreadConversation(harness.botId, {
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      userId: "user-1",
      agentId: "agent-1",
      title: "Release plan",
      now: "2026-01-01T00:02:00.000Z",
    });

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_1",
      messageId: "om_child",
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "Release plan",
      text: "@Paseo Please check this.",
      createTime: 1767226200000,
    } satisfies NormalizedLarkMessageEvent);

    harness.lastMessages.set("agent-1", "The answer is ready.");
    await harness.emitAgentState("agent-1", "running");
    await harness.emitAgentState("agent-1", "idle");

    expect(harness.adapter.replyToMessageInThread).not.toHaveBeenCalled();
    expect(harness.adapter.replyInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_root",
      '<at user_id="ou_1"></at> The answer is ready.',
    );
    expect(harness.adapter.replyInThread).not.toHaveBeenCalledWith(
      expect.anything(),
      "omt_topic",
      expect.any(String),
    );
  });

  test("uses the ACK message as the reply anchor after creating a new Lark topic", async () => {
    const harness = createHarness();

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_2",
      messageId: "om_first",
      chatId: "oc_1",
      threadId: null,
      rootMessageId: null,
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "New topic",
      text: "@Paseo Please start a new topic.",
      createTime: 1767226200000,
    } satisfies NormalizedLarkMessageEvent);

    expect(harness.adapter.replyToMessageInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_first",
      "收到消息，处理中",
    );
    expect(
      harness.store.findConversationByThread(harness.botId, "oc_1", "omt_created"),
    ).toMatchObject({
      agentId: "agent-created",
      rootMessageId: "om_first",
    });

    harness.lastMessages.set("agent-created", "Created topic answer.");
    await harness.emitAgentState("agent-created", "running");
    await harness.emitAgentState("agent-created", "idle");

    expect(harness.adapter.replyInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_ack",
      '<at user_id="ou_1"></at> Created topic answer.',
    );
    expect(harness.adapter.replyInThread).not.toHaveBeenCalledWith(
      expect.anything(),
      "omt_created",
      expect.any(String),
    );
  });

  test("acks the first mention in an existing Lark topic before creating the agent", async () => {
    const harness = createHarness();
    vi.mocked(harness.adapter.replyToMessageInThread).mockResolvedValue({
      threadId: "omt_topic",
      messageId: "om_ack_existing_topic",
    });

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_first_existing_topic",
      messageId: "om_current",
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "Release plan",
      text: "@Paseo Please work on this topic.",
      createTime: 1767226200000,
    } satisfies NormalizedLarkMessageEvent);

    expect(harness.adapter.replyToMessageInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_current",
      "收到消息，处理中",
    );
    expect(harness.createAgent).toHaveBeenCalled();
    expect(
      vi.mocked(harness.adapter.replyToMessageInThread).mock.invocationCallOrder[0],
    ).toBeLessThan(vi.mocked(harness.createAgent).mock.invocationCallOrder[0] ?? 0);

    harness.lastMessages.set("agent-created", "First topic answer.");
    await harness.emitAgentState("agent-created", "running");
    await harness.emitAgentState("agent-created", "idle");

    expect(harness.adapter.replyInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_ack_existing_topic",
      '<at user_id="ou_1"></at> First topic answer.',
    );
  });

  test("does not mention the sender when the Lark request explicitly asks not to", async () => {
    const harness = createHarness();
    harness.store.recordThreadConversation(harness.botId, {
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      userId: "user-1",
      agentId: "agent-1",
      title: "Release plan",
      now: "2026-01-01T00:02:00.000Z",
    });

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_no_at",
      messageId: "om_no_at",
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "Release plan",
      text: "@Paseo Please check this, 不要 at 我。",
      createTime: 1767226200000,
    } satisfies NormalizedLarkMessageEvent);

    harness.lastMessages.set("agent-1", "No mention answer.");
    await harness.emitAgentState("agent-1", "running");
    await harness.emitAgentState("agent-1", "idle");

    expect(harness.adapter.replyInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_root",
      "No mention answer.",
    );
  });

  test("injects Lark topic history since the previous mention into existing agents", async () => {
    const harness = createHarness();
    const previousMentionAt = new Date(1767225600000).toISOString();
    harness.store.recordThreadConversation(harness.botId, {
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      userId: "user-1",
      agentId: "agent-1",
      title: "Release plan",
      now: previousMentionAt,
    });
    vi.mocked(harness.adapter.listThreadMessages).mockResolvedValue([
      {
        message_id: "om_previous_at",
        root_id: "om_root",
        create_time: "1767225600000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "@Paseo earlier request" }) },
      },
      {
        message_id: "om_context",
        root_id: "om_root",
        create_time: "1767225900000",
        sender_name: "Bob",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "The deployment failed on canary." }) },
      },
      {
        message_id: "om_current",
        root_id: "om_root",
        create_time: "1767226200000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "@Paseo summarize the latest context" }) },
      },
    ]);

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_history",
      messageId: "om_current",
      chatId: "oc_1",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "Release plan",
      text: "@Paseo summarize the latest context",
      createTime: 1767226200000,
    } satisfies NormalizedLarkMessageEvent);

    expect(harness.adapter.listThreadMessages).toHaveBeenCalledWith(
      expect.anything(),
      "omt_topic",
      { pageSize: 0 },
    );
    expect(harness.agentManager.streamAgent).toHaveBeenCalled();
    const prompt = vi.mocked(harness.agentManager.streamAgent).mock.calls.at(-1)?.[1];
    expect(prompt).toContain('<lark_topic_history topic_id="omt_topic" count="1"');
    expect(prompt).toContain("Bob: The deployment failed on canary.");
    expect(prompt).not.toContain("earlier request");
    expect(prompt).toContain("@Paseo summarize the latest context");
  });

  test("fetches topic history with the resolved thread id when the Lark event omits thread_id", async () => {
    const harness = createHarness();
    vi.mocked(harness.adapter.replyToMessageInThread).mockResolvedValue({
      threadId: "omt_resolved",
      messageId: "om_ack",
    });
    vi.mocked(harness.adapter.listThreadMessages).mockResolvedValue([
      {
        message_id: "om_context",
        create_time: "1767225900000",
        sender_name: "Bob",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "上文讨论：灰度失败，需要看错误码。" }) },
      },
      {
        message_id: "om_current",
        create_time: "1767226200000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "@Paseo 帮忙分析" }) },
      },
      {
        message_id: "om_ack",
        create_time: "1767226201000",
        sender_name: "Paseo",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "Received. Paseo is working on this topic…" }) },
      },
    ]);

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_resolved_history",
      messageId: "om_current",
      chatId: "oc_1",
      threadId: null,
      rootMessageId: null,
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "故障分析",
      text: "@Paseo 帮忙分析",
      createTime: 1767226200000,
    } satisfies NormalizedLarkMessageEvent);

    expect(harness.adapter.listThreadMessages).toHaveBeenCalledWith(
      expect.anything(),
      "omt_resolved",
      { pageSize: 0 },
    );
    expect(harness.agentManager.streamAgent).toHaveBeenCalled();
    const prompt = vi.mocked(harness.agentManager.streamAgent).mock.calls.at(-1)?.[1];
    expect(prompt).toContain('<lark_topic_history topic_id="omt_resolved" count="1"');
    expect(prompt).toContain("Bob: 上文讨论：灰度失败，需要看错误码。");
    expect(prompt).not.toContain("Received. Paseo is working");
    expect(prompt).toContain("@Paseo 帮忙分析");
  });

  test("enriches omitted thread metadata with message.get before fetching topic history", async () => {
    const harness = createHarness();
    vi.mocked(harness.adapter.replyToMessageInThread).mockResolvedValue({
      threadId: "omt_from_get",
      messageId: "om_ack_from_get",
    });
    vi.mocked(harness.adapter.getMessage).mockResolvedValue({
      message_id: "om_current",
      chat_id: "oc_1",
      chat_type: "group",
      thread_id: "omt_from_get",
      root_id: "om_root_from_get",
      create_time: "1767226200000",
      msg_type: "text",
      body: { content: JSON.stringify({ text: "@Paseo 结合话题上文回答" }) },
      mentions: [{ key: "@_user_1", name: "Paseo", id: { open_id: "ou_bot" } }],
    });
    vi.mocked(harness.adapter.listThreadMessages).mockResolvedValue([
      {
        message_id: "om_context",
        root_id: "om_root_from_get",
        create_time: "1767225900000",
        sender_name: "Bob",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "话题里的历史消息" }) },
      },
      {
        message_id: "om_current",
        root_id: "om_root_from_get",
        create_time: "1767226200000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "@Paseo 结合话题上文回答" }) },
      },
    ]);

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_enrich_history",
      messageId: "om_current",
      chatId: "oc_1",
      threadId: null,
      rootMessageId: null,
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "结合话题上文回答",
      text: "@Paseo 结合话题上文回答",
      createTime: null,
    } satisfies NormalizedLarkMessageEvent);

    expect(harness.adapter.replyToMessageInThread).toHaveBeenCalledWith(
      expect.anything(),
      "om_current",
      "收到消息，处理中",
    );
    expect(harness.adapter.listThreadMessages).toHaveBeenCalledWith(
      expect.anything(),
      "omt_from_get",
      { pageSize: 0 },
    );
    expect(harness.agentManager.streamAgent).toHaveBeenCalled();
    const prompt = vi.mocked(harness.agentManager.streamAgent).mock.calls.at(-1)?.[1];
    expect(prompt).toContain('<lark_topic_history topic_id="omt_from_get" count="1"');
    expect(prompt).toContain("Bob: 话题里的历史消息");
    expect(prompt).toContain("@Paseo 结合话题上文回答");
  });

  test("ignores unmentioned group messages instead of replying to every group message", async () => {
    const harness = createHarness();

    await harness.service.handleIncomingEvent(harness.botId, {
      eventId: "evt_group_without_mention",
      messageId: "om_plain",
      chatId: "oc_1",
      chatType: "group",
      threadId: "omt_topic",
      rootMessageId: "om_root",
      openId: "ou_1",
      unionId: null,
      displayName: "Alice",
      topicName: "Release plan",
      text: "这是一条普通群消息，不应该触发 Paseo。",
      createTime: 1767226200000,
      mentions: [],
    } satisfies NormalizedLarkMessageEvent);

    expect(harness.adapter.replyToMessageInThread).not.toHaveBeenCalled();
    expect(harness.adapter.replyInThread).not.toHaveBeenCalled();
    expect(harness.adapter.listThreadMessages).not.toHaveBeenCalled();
    expect(harness.createAgent).not.toHaveBeenCalled();
    expect(harness.agentManager.streamAgent).not.toHaveBeenCalled();
  });
});
