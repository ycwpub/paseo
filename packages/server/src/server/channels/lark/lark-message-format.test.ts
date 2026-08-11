import { describe, expect, test } from "vitest";
import {
  filterLarkTopicHistoryMessages,
  formatLarkUserPromptWithTopicHistory,
  getLarkEventDedupeKey,
  isLarkBotMentionEvent,
  normalizeLarkMessageEvent,
} from "./lark-message-format.js";

describe("lark-message-format", () => {
  test("normalizes message id, thread id, and topic name", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_1",
      sender: {
        sender_name: "Alice",
        sender_id: {
          open_id: "ou_1",
          union_id: "on_1",
        },
      },
      message: {
        message_id: "om_1",
        chat_id: "oc_1",
        thread_id: "omt_1",
        root_id: "om_root",
        parent_id: "om_quoted",
        topic_name: "Launch checklist",
        message_type: "text",
        content: JSON.stringify({ text: "Please review the release." }),
        create_time: "1767225900000",
      },
    });

    expect(event).toMatchObject({
      eventId: "evt_1",
      messageId: "om_1",
      chatId: "oc_1",
      threadId: "omt_1",
      rootMessageId: "om_root",
      quotedMessageId: "om_quoted",
      topicName: "Launch checklist",
      text: "Please review the release.",
      createTime: 1767225900000,
    });
    expect(event ? getLarkEventDedupeKey(event) : null).toBe("om_1");
  });

  test("derives a topic name from the first sentence when Lark does not provide one", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_2",
      sender: { sender_name: "Alice", sender_id: {} },
      message: {
        message_id: "om_2",
        chat_id: "oc_1",
        message_type: "text",
        content: JSON.stringify({ text: "Short question. Please ignore the rest." }),
      },
    });

    expect(event?.topicName).toBe("Short question");
  });

  test("normalizes mention identities from both event and REST API shapes", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_mentions",
      sender: { sender_name: "Alice", sender_id: {} },
      message: {
        message_id: "om_mentions",
        chat_id: "oc_1",
        chat_type: "group",
        message_type: "text",
        content: JSON.stringify({ text: "@Paseo hello" }),
        mentions: [
          {
            key: "@_user_1",
            name: "Paseo",
            id: { open_id: "ou_bot" },
          },
          {
            key: "@_user_2",
            name: "Other bot",
            id: "cli_other",
            id_type: "app_id",
          },
        ],
      },
    });

    expect(event?.mentions).toEqual([
      {
        key: "@_user_1",
        name: "Paseo",
        openId: "ou_bot",
        userId: null,
        appId: null,
        idType: null,
      },
      {
        key: "@_user_2",
        name: "Other bot",
        openId: null,
        userId: null,
        appId: "cli_other",
        idType: "app_id",
      },
    ]);
  });

  test("matches only the current bot identity in group messages", () => {
    const event = {
      eventId: "evt_route",
      messageId: "om_route",
      chatId: "oc_1",
      chatType: "group",
      threadId: null,
      rootMessageId: null,
      openId: "ou_user",
      unionId: null,
      displayName: "Alice",
      topicName: "Routing",
      text: "@OtherBot hello",
      createTime: null,
      mentions: [
        {
          key: "@_user_1",
          name: "Other bot",
          openId: "ou_other",
          userId: null,
          appId: null,
          idType: null,
        },
      ],
    };

    expect(isLarkBotMentionEvent(event, { openId: "ou_bot", appId: "cli_bot" })).toBe(false);
    expect(isLarkBotMentionEvent(event, { openId: "ou_other", appId: "cli_other" })).toBe(true);
    expect(
      isLarkBotMentionEvent(
        {
          ...event,
          mentions: [{ ...event.mentions[0], openId: null, appId: "cli_bot" }],
        },
        { openId: "ou_bot", appId: "cli_bot" },
      ),
    ).toBe(true);
    expect(isLarkBotMentionEvent({ ...event, chatType: "p2p", mentions: [] }, null)).toBe(true);
  });

  test("ignores an empty Lark topic name and falls back to the first sentence", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_3",
      sender: { sender_name: "Alice", sender_id: {} },
      message: {
        message_id: "om_3",
        chat_id: "oc_1",
        topic_name: "   ",
        message_type: "text",
        content: JSON.stringify({ text: "请帮我总结这个需求。第二句不应该进入标题。" }),
      },
    });

    expect(event?.topicName).toBe("请帮我总结这个需求");
  });

  test("formats topic history since previous bot mention before the current mention", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_history",
      sender: { sender_name: "Alice", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_current",
        chat_id: "oc_1",
        thread_id: "omt_topic",
        root_id: "om_root",
        topic_name: "Release topic",
        message_type: "text",
        create_time: "1767226200000",
        content: JSON.stringify({ text: "@Paseo 请结合上面的讨论回答" }),
      },
    });
    expect(event).not.toBeNull();
    const messages = [
      {
        message_id: "om_old_at",
        root_id: "om_root",
        create_time: "1767225600000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "@Paseo 之前的问题" }) },
      },
      {
        message_id: "om_context_1",
        root_id: "om_root",
        create_time: "1767225900000",
        sender_name: "Bob",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "补充背景 A" }) },
      },
      {
        message_id: "om_context_2",
        root_id: "om_root",
        create_time: "1767225960000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "补充背景 B" }) },
      },
      {
        message_id: "om_paseo_reply",
        root_id: "om_root",
        create_time: "1767226020000",
        sender: { sender_type: "app" },
        sender_name: "Paseo",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "Paseo 上一次自己的回答" }) },
      },
      {
        message_id: "om_current",
        root_id: "om_root",
        create_time: "1767226200000",
        sender_name: "Alice",
        msg_type: "text",
        body: { content: JSON.stringify({ text: "@Paseo 请结合上面的讨论回答" }) },
      },
    ];

    const filtered = filterLarkTopicHistoryMessages({
      event: event!,
      messages,
      previousMentionAt: new Date(1767225600000).toISOString(),
    });
    expect(filtered.map((message) => message.message_id)).toEqual(["om_context_1", "om_context_2"]);

    const prompt = formatLarkUserPromptWithTopicHistory({
      event: event!,
      messages,
      previousMentionAt: new Date(1767225600000).toISOString(),
    });
    expect(prompt).toContain('<lark_topic_history topic_id="omt_topic" count="2"');
    expect(prompt).toContain("Bob: 补充背景 A");
    expect(prompt).toContain("Alice: 补充背景 B");
    expect(prompt).not.toContain("之前的问题");
    expect(prompt).not.toContain("Paseo 上一次自己的回答");
    expect(prompt).toContain("<current_lark_message>");
    expect(prompt).toContain("@Paseo 请结合上面的讨论回答");
  });

  test("uses the resolved thread id and includes prior messages when there is no previous mention", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_resolved",
      sender: { sender_name: "Alice", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_current",
        chat_id: "oc_1",
        topic_name: "故障话题",
        message_type: "text",
        create_time: "1767226200000",
        content: JSON.stringify({ text: "@Paseo 看看上下文" }),
      },
    });
    expect(event).not.toBeNull();

    const prompt = formatLarkUserPromptWithTopicHistory({
      event: event!,
      threadId: "omt_resolved",
      previousMentionAt: null,
      messages: [
        {
          message_id: "om_context",
          create_time: "1767225900000",
          sender_name: "Bob",
          msg_type: "text",
          body: { content: JSON.stringify({ text: "前面补充过一个关键背景" }) },
        },
        {
          message_id: "om_current",
          create_time: "1767226200000",
          sender_name: "Alice",
          msg_type: "text",
          body: { content: JSON.stringify({ text: "@Paseo 看看上下文" }) },
        },
      ],
    });

    expect(prompt).toContain('<lark_topic_history topic_id="omt_resolved" count="1"');
    expect(prompt).toContain("Bob: 前面补充过一个关键背景");
    expect(prompt).toContain("@Paseo 看看上下文");
  });

  test("includes the readable content of an interactive message quoted in a topic", () => {
    const event = normalizeLarkMessageEvent({
      event_id: "evt_quote",
      sender: { sender_name: "Alice", sender_id: { open_id: "ou_1" } },
      message: {
        message_id: "om_current",
        chat_id: "oc_1",
        thread_id: "omt_topic",
        root_id: "om_root",
        parent_id: "om_alarm_card",
        topic_name: "报警处理",
        message_type: "text",
        create_time: "1767226200000",
        content: JSON.stringify({ text: "@Paseo 帮我查看引用的报警" }),
      },
    });
    expect(event).not.toBeNull();

    const prompt = formatLarkUserPromptWithTopicHistory({
      event: event!,
      previousMentionAt: null,
      messages: [],
      quotedMessages: [
        {
          message_id: "om_alarm_card",
          sender: { sender_name: "Alarm bot", sender_type: "app" },
          msg_type: "interactive",
          body: {
            content: JSON.stringify({
              schema: "2.0",
              header: { title: { tag: "plain_text", content: "报警是否有帮助？" } },
              body: {
                elements: [
                  {
                    tag: "select_static",
                    placeholder: { tag: "plain_text", content: "确认并屏蔽" },
                  },
                  {
                    tag: "markdown",
                    content:
                      "[2026-07-29T11:00:36+08:00]\n[fanyunzhe] 确认了报警\n\n该消息由自定义消息模板default生成",
                  },
                ],
              },
            }),
          },
        },
      ],
    });

    expect(prompt).toContain('<lark_quoted_message message_id="om_alarm_card" type="interactive">');
    expect(prompt).toContain("报警是否有帮助？");
    expect(prompt).toContain("[select: 确认并屏蔽]");
    expect(prompt).toContain("[fanyunzhe] 确认了报警");
    expect(prompt).toContain("<current_lark_message>");
    expect(prompt).toContain("@Paseo 帮我查看引用的报警");
  });
});
