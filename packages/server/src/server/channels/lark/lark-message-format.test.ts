import { describe, expect, test } from "vitest";
import {
  extractLarkUserMentionDirective,
  filterLarkTopicHistoryMessages,
  formatLarkCollaborationPrompt,
  formatLarkSubstitutePrompt,
  formatLarkSubstituteReply,
  formatLarkUserPromptWithTopicHistory,
  getLarkEventDedupeKey,
  isLarkBotMentionEvent,
  normalizeLarkMessageEvent,
  resolveLarkAddressedBots,
  resolveLarkSubstituteTrigger,
  routeLarkReplyBotMentions,
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
      senderType: null,
      topicName: "Launch checklist",
      text: "Please review the release.",
      createTime: 1767225900000,
    });
    expect(event ? getLarkEventDedupeKey(event) : null).toBe("om_1");
  });

  test("injects available bots and explicit collaboration routing rules", () => {
    const prompt = formatLarkCollaborationPrompt({
      prompt: "Please implement the change.",
      currentBotName: "Lead",
      senderBot: null,
      userName: "Alice",
      availableBots: [
        { openId: "ou_reviewer", name: "Reviewer" },
        { openId: "ou_writer", name: "Writer" },
      ],
      addressedBots: [
        {
          token: "@_user_1",
          name: "Lead",
          openId: "ou_lead",
          isCurrentBot: true,
        },
        {
          token: "@_user_2",
          name: "Reviewer",
          openId: "ou_reviewer",
          isCurrentBot: false,
        },
      ],
    });

    expect(prompt).toContain("Current bot: Lead.");
    expect(prompt).toContain('This turn was sent by user "Alice".');
    expect(prompt).toContain('<bot name="Reviewer" open_id="ou_reviewer" />');
    expect(prompt).toContain(
      '<mention token="@_user_1" name="Lead" open_id="ou_lead" current_bot="true" />',
    );
    expect(prompt).toContain(
      '<mention token="@_user_2" name="Reviewer" open_id="ou_reviewer" current_bot="false" />',
    );
    expect(prompt).toContain("Execute only the work explicitly assigned to the current bot.");
    expect(prompt).toContain("never perform an independent review");
    expect(prompt).toContain("MUST @ that bot's exact name");
    expect(prompt).toContain("交由审核负责人审核");
    expect(prompt).toContain("@Reviewer 方案已完成，请独立审核。");
    expect(prompt).toContain("already a usable, verified bot identity");
    expect(prompt).toContain("Never claim that the bot name or identity is missing");
    expect(prompt).toContain(
      'if "Reviewer" must act after your work, the visible answer must include "@Reviewer"',
    );
    expect(prompt).toContain("Completion of only your own subtask is not overall completion");
    expect(prompt).toContain("Only when another bot must reply or take an independent action");
    expect(prompt).toContain("paseo:lark-route=user");
    expect(prompt).toContain("ONLY when the overall task is complete");
    expect(prompt).toContain("explicit human authorization or permission");
    expect(prompt).toContain("NEVER write @_user_1, @_user_2");
  });

  test("always injects explicit user routing rules even when no other bot is available", () => {
    const prompt = formatLarkCollaborationPrompt({
      prompt: "Please finish the task.",
      currentBotName: "Paseo",
      senderBot: null,
      userName: "Alice",
      availableBots: [],
      addressedBots: [],
    });

    expect(prompt).toContain("<!-- paseo:lark-route=user -->");
    expect(prompt).toContain("<!-- paseo:lark-route=none -->");
  });

  test("maps only confirmed bot mentions and marks the current bot", () => {
    expect(
      resolveLarkAddressedBots({
        mentions: [
          {
            key: "@_user_1",
            name: "Paseo Mac",
            openId: "ou_current",
            userId: null,
            appId: null,
            idType: "open_id",
          },
          {
            key: "@_user_2",
            name: "Paseo Reviewer",
            openId: "ou_reviewer",
            userId: null,
            appId: null,
            idType: "open_id",
          },
          {
            key: "@_user_3",
            name: "Alice",
            openId: "ou_human",
            userId: null,
            appId: null,
            idType: "open_id",
          },
        ],
        chatBots: [
          { openId: "ou_current", name: "Paseo Mac" },
          { openId: "ou_reviewer", name: "Paseo Reviewer" },
        ],
        currentBot: {
          openId: "ou_current",
          appId: "cli_current",
          name: "Paseo Mac",
        },
      }),
    ).toEqual([
      {
        token: "@_user_1",
        name: "Paseo Mac",
        openId: "ou_current",
        isCurrentBot: true,
      },
      {
        token: "@_user_2",
        name: "Paseo Reviewer",
        openId: "ou_reviewer",
        isCurrentBot: false,
      },
    ]);
  });

  test("uses configured bot names to recover app-scoped peer mention identities", () => {
    expect(
      resolveLarkAddressedBots({
        mentions: [
          {
            key: "@_user_1",
            name: "Paseo",
            openId: "ou_current",
            userId: null,
            appId: null,
            idType: "open_id",
          },
          {
            key: "@_user_2",
            name: "审核机器人",
            openId: "ou_reviewer_as_seen_by_current",
            userId: null,
            appId: null,
            idType: "open_id",
          },
          {
            key: "@_user_3",
            name: "Alice",
            openId: "ou_human",
            userId: null,
            appId: null,
            idType: "open_id",
          },
        ],
        chatBots: [],
        knownBotNames: ["Paseo", "审核机器人"],
        currentBot: {
          openId: "ou_current",
          appId: "cli_current",
          name: "Paseo",
        },
      }),
    ).toEqual([
      {
        token: "@_user_1",
        name: "Paseo",
        openId: "ou_current",
        isCurrentBot: true,
      },
      {
        token: "@_user_2",
        name: "审核机器人",
        openId: "ou_reviewer_as_seen_by_current",
        isCurrentBot: false,
      },
    ]);
  });

  test("prefers the event-scoped open id when bot discovery returns a different handle", () => {
    expect(
      resolveLarkAddressedBots({
        mentions: [
          {
            key: "@_user_2",
            name: "Reviewer",
            openId: "ou_reviewer_from_event",
            userId: null,
            appId: null,
            idType: "open_id",
          },
        ],
        chatBots: [{ openId: "bot_reviewer_from_list", name: "Reviewer" }],
        currentBot: {
          openId: "ou_current",
          appId: "cli_current",
          name: "Paseo",
        },
      }),
    ).toEqual([
      {
        token: "@_user_2",
        name: "Reviewer",
        openId: "ou_reviewer_from_event",
        isCurrentBot: false,
      },
    ]);
  });

  test("converts an intentional bot addressee into a real Lark mention", () => {
    expect(
      routeLarkReplyBotMentions("实现已完成。@Reviewer 请检查边界条件；@Writer 请补充发布说明。", [
        { openId: "ou_reviewer", name: "Reviewer" },
        { openId: "ou_writer", name: "Writer" },
      ]),
    ).toEqual({
      text: '实现已完成。<at user_id="ou_reviewer"></at> 请检查边界条件；<at user_id="ou_writer"></at> 请补充发布说明。',
      mentionedBotOpenIds: ["ou_reviewer", "ou_writer"],
    });
  });

  test("converts an input mention placeholder into the mapped real bot mention", () => {
    expect(
      routeLarkReplyBotMentions(
        "@_user_2 方案已完成，请独立审核。",
        [{ openId: "ou_reviewer", name: "Reviewer" }],
        [
          {
            token: "@_user_1",
            name: "Paseo",
            openId: "ou_current",
            isCurrentBot: true,
          },
          {
            token: "@_user_2",
            name: "Reviewer",
            openId: "ou_reviewer",
            isCurrentBot: false,
          },
        ],
      ),
    ).toEqual({
      text: '<at user_id="ou_reviewer"></at> 方案已完成，请独立审核。',
      mentionedBotOpenIds: ["ou_reviewer"],
    });
  });

  test("extracts and removes the explicit user mention routing directive", () => {
    expect(
      extractLarkUserMentionDirective("<!-- paseo:lark-route=user -->\n任务已经完成，请查看结果。"),
    ).toEqual({
      text: "任务已经完成，请查看结果。",
      mentionUser: true,
    });
    expect(
      extractLarkUserMentionDirective(
        "<!-- paseo:lark-route=none -->\n正在处理，暂时不需要用户介入。",
      ),
    ).toEqual({
      text: "正在处理，暂时不需要用户介入。",
      mentionUser: false,
    });
    expect(extractLarkUserMentionDirective("没有路由指令的普通回复。")).toEqual({
      text: "没有路由指令的普通回复。",
      mentionUser: false,
    });
  });

  test("does not turn bot names in Markdown code into Lark mentions", () => {
    const result = routeLarkReplyBotMentions(
      "示例：`@Reviewer 请检查`。\n```\n@Reviewer\n```\n无需接力。",
      [{ openId: "ou_reviewer", name: "Reviewer" }],
    );

    expect(result).toEqual({
      text: "示例：`@Reviewer 请检查`。\n```\n@Reviewer\n```\n无需接力。",
      mentionedBotOpenIds: [],
    });
  });

  test("does not guess between bots with the same display name", () => {
    expect(
      routeLarkReplyBotMentions("@Reviewer 请处理。", [
        { openId: "ou_reviewer_1", name: "Reviewer" },
        { openId: "ou_reviewer_2", name: "Reviewer" },
      ]),
    ).toEqual({
      text: "@Reviewer 请处理。",
      mentionedBotOpenIds: [],
    });
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

  test("matches substitute targets only by configured open_id", () => {
    const event = {
      eventId: "evt_substitute",
      messageId: "om_substitute",
      chatId: "oc_1",
      chatType: "group",
      threadId: null,
      rootMessageId: null,
      openId: "ou_user",
      unionId: null,
      displayName: "Alice",
      topicName: "Substitute",
      text: "@张三 请回复",
      createTime: null,
      mentions: [
        {
          key: "@_user_1",
          name: "Different rendered name",
          openId: "ou_target",
          userId: null,
          appId: null,
          idType: "open_id",
        },
      ],
    };
    const trigger = resolveLarkSubstituteTrigger(event, {
      enabled: true,
      openId: "ou_target",
      name: "张三",
    });

    expect(trigger?.source).toBe("configured_target");
    expect(trigger?.configuredTarget).toEqual({ openId: "ou_target", name: "张三" });
    expect(
      resolveLarkSubstituteTrigger(event, {
        enabled: true,
        openId: "ou_other",
        name: "Different rendered name",
      }),
    ).toBeNull();
    expect(
      resolveLarkSubstituteTrigger(event, {
        enabled: false,
        openId: "ou_target",
        name: "张三",
      }),
    ).toBeNull();
    expect(
      resolveLarkSubstituteTrigger(
        { ...event, chatType: "p2p" },
        { enabled: true, openId: "ou_target", name: "张三" },
      ),
    ).toBeNull();
  });

  test("triggers substitute mode when the current bot is mentioned", () => {
    const event = {
      eventId: "evt_substitute_bot",
      messageId: "om_substitute_bot",
      chatId: "oc_1",
      chatType: "group",
      threadId: null,
      rootMessageId: null,
      openId: "ou_user",
      unionId: null,
      displayName: "Alice",
      topicName: "Substitute",
      text: "@Paseo 请回复",
      createTime: null,
      mentions: [
        {
          key: "@_user_1",
          name: "Paseo",
          openId: "ou_bot",
          userId: null,
          appId: "cli_bot",
          idType: "open_id",
        },
      ],
    };

    const trigger = resolveLarkSubstituteTrigger(
      event,
      {
        enabled: true,
        openId: "ou_target",
        name: "张三",
      },
      { openId: "ou_bot", appId: "cli_bot" },
    );

    expect(trigger?.source).toBe("current_bot");
    expect(trigger?.configuredTarget).toEqual({ openId: "ou_target", name: "张三" });
    expect(trigger?.observedMention.openId).toBe("ou_bot");
    expect(
      resolveLarkSubstituteTrigger(
        { ...event, mentions: [] },
        { enabled: true, openId: "ou_target", name: "张三" },
        { openId: "ou_bot", appId: "cli_bot" },
      ),
    ).toBeNull();
  });

  test("injects substitute identity data and a legacy provider fallback instruction", () => {
    const prompt = formatLarkSubstitutePrompt("Original prompt", {
      source: "configured_target",
      configuredTarget: { openId: "ou_target", name: '张三 & "负责人"' },
      observedMention: {
        key: "@_user_1",
        name: "张三",
        openId: "ou_target",
        userId: null,
        appId: null,
        idType: "open_id",
      },
    });

    expect(prompt).toContain(
      '<configured_target open_id="ou_target" name="张三 &amp; &quot;负责人&quot;" />',
    );
    expect(prompt).toContain("<trigger_source>configured_target</trigger_source>");
    expect(prompt).toContain("Reply on behalf of that person");
    expect(prompt).toContain("Paseo adds the visible substitute disclosure label");
    expect(prompt).toContain("Do not write another");
    expect(prompt).toContain("matching is based only on the configured open_id");
  });

  test("describes a current-bot substitute trigger without claiming the target was mentioned", () => {
    const prompt = formatLarkSubstitutePrompt("Original prompt", {
      source: "current_bot",
      configuredTarget: { openId: "ou_target", name: "张三" },
      observedMention: {
        key: "@_user_1",
        name: "Paseo",
        openId: "ou_bot",
        userId: null,
        appId: "cli_bot",
        idType: "open_id",
      },
    });

    expect(prompt).toContain("<trigger_source>current_bot</trigger_source>");
    expect(prompt).toContain("mentioned the current bot while substitute mode is enabled");
    expect(prompt).not.toContain(
      "triggered substitute mode because it mentioned the configured substitute target",
    );
  });

  test("adds a deterministic substitute disclosure to the visible reply", () => {
    const trigger = {
      source: "current_bot" as const,
      configuredTarget: { openId: "ou_target", name: "张三" },
      observedMention: {
        key: "@_user_1",
        name: "Paseo",
        openId: "ou_bot",
        userId: null,
        appId: "cli_bot",
        idType: "open_id",
      },
    };

    expect(formatLarkSubstituteReply("1 + 1 = 2。", trigger)).toBe("【代张三回复】1 + 1 = 2。");
    expect(formatLarkSubstituteReply("我代表张三回复：可以。", trigger)).toBe(
      "【代张三回复】可以。",
    );
    expect(formatLarkSubstituteReply("代张三回复：2。", trigger)).toBe("【代张三回复】2。");
    expect(formatLarkSubstituteReply("【代张三回复】代张三回复：2。", trigger)).toBe(
      "【代张三回复】2。",
    );
    expect(
      formatLarkSubstituteReply("完成。", {
        ...trigger,
        configuredTarget: { openId: "ou_target", name: " \n " },
      }),
    ).toBe("【替身回复】完成。");
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
