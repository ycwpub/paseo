import { describe, expect, test } from "vitest";
import {
  filterLarkTopicHistoryMessages,
  formatLarkUserPromptWithTopicHistory,
  getLarkEventDedupeKey,
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
      topicName: "Launch checklist",
      text: "Please review the release.",
      createTime: 1767225900000,
    });
    expect(event ? getLarkEventDedupeKey(event) : null).toBe("evt_1:omt_1:om_1");
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
});
