import { describe, expect, test } from "vitest";
import type { LarkSubstituteMode } from "@getpaseo/protocol/messages";
import { matchLarkSubstituteMode as matchMode } from "./lark-substitute-rule-matcher.js";

function mode(overrides: Partial<LarkSubstituteMode> = {}): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "研发替身",
    enabled: true,
    botId: "bot-1",
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 20,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "",
    delaySeconds: 0,
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

function matchLarkSubstituteMode(input: Omit<Parameters<typeof matchMode>[0], "authorizedUser">) {
  return matchMode({
    ...input,
    authorizedUser: {
      openId: "ou_target",
      name: "张三",
      email: "target@example.com",
    },
  });
}

const groupEvent = {
  eventId: "event-1",
  messageId: "message-1",
  chatId: "oc_group",
  chatType: "group",
  threadId: null,
  rootMessageId: null,
  openId: "ou_sender",
  unionId: null,
  displayName: "李四",
  topicName: "问题",
  text: "@张三 如何发布？",
  createTime: Date.parse("2026-09-04T02:00:00.000Z"),
  mentions: [
    {
      key: "@_user_1",
      name: "张三",
      openId: "ou_target",
      userId: null,
      appId: null,
      idType: "open_id",
    },
  ],
};

const directory = {
  users: [
    {
      appId: "cli_test",
      openId: "ou_sender",
      displayName: "李四",
      email: "lisi@example.com",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
  chats: [
    {
      appId: "cli_test",
      chatId: "oc_group",
      groupId: "group-1",
      name: "研发一群",
      updatedAt: "2026-09-04T00:00:00.000Z",
    },
  ],
};

describe("matchLarkSubstituteMode", () => {
  test("requires a group message to mention the OAuth-authorized substitute user", () => {
    expect(
      matchLarkSubstituteMode({
        modes: [mode({ audienceAllowlist: [{ id: "all", type: "all" }] })],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, mentions: [] },
        directory,
      }),
    ).toBeNull();
  });

  test("applies deny rules before allow rules and returns question-type policies", () => {
    const configured = mode({
      allowlist: [
        {
          id: "allow-group",
          type: "group_name_regex",
          pattern: "^研发",
        },
        {
          id: "allow-question",
          type: "question_type",
          description: "研发和代码问题",
        },
      ],
      denylist: [
        {
          id: "deny-question",
          type: "question_type",
          description: "人事和薪酬问题",
        },
      ],
    });
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toMatchObject({
      mode: { id: "mode-1" },
      questionAllowRules: ["研发和代码问题"],
      questionDenyRules: ["人事和薪酬问题"],
    });

    expect(
      matchLarkSubstituteMode({
        modes: [
          mode({
            audienceAllowlist: [{ id: "all", type: "all" }],
            denylist: [
              {
                id: "deny-user",
                type: "user",
                openId: null,
                name: null,
                email: "lisi@example.com",
              },
            ],
          }),
        ],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toBeNull();
  });

  test("supports configured time ranges and private-message triggering", () => {
    const configured = mode({
      audienceAllowlist: [
        {
          id: "allow-private-user",
          type: "user",
          openId: "ou_sender",
          name: "李四",
          email: "lisi@example.com",
        },
        {
          id: "allow-group",
          type: "group",
          chatId: "oc_group",
          groupId: "group-1",
          name: "研发一群",
        },
      ],
      activeTimeRanges: [
        {
          id: "workday",
          weekdays: [1, 2, 3, 4, 5],
          startTime: "09:00",
          endTime: "18:00",
          timezone: "Asia/Shanghai",
        },
      ],
    });
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, chatType: "p2p", mentions: [] },
        directory,
        now: new Date("2026-09-04T02:00:00.000Z"),
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
        now: new Date("2026-09-04T12:00:00.000Z"),
      }),
    ).toBeNull();
  });

  test("uses weekday 7 for Sunday", () => {
    const configured = mode({
      audienceAllowlist: [
        {
          id: "allow-group",
          type: "group",
          chatId: "oc_group",
          groupId: "group-1",
          name: "研发一群",
        },
      ],
      activeTimeRanges: [
        {
          id: "sunday",
          weekdays: [7],
          startTime: "09:00",
          endTime: "18:00",
          timezone: "Asia/Shanghai",
        },
      ],
    });
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
        now: new Date("2026-09-06T02:00:00.000Z"),
      }),
    ).not.toBeNull();
  });

  test("prefers stable user identifiers over duplicate display names", () => {
    expect(
      matchLarkSubstituteMode({
        modes: [
          mode({
            allowlist: [
              {
                id: "allow-user",
                type: "user",
                openId: "ou_someone_else",
                name: "李四",
                email: "someone@example.com",
              },
            ],
          }),
        ],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, chatType: "p2p", mentions: [] },
        directory,
      }),
    ).toBeNull();
  });

  test("rejects private and group messages when the relevant audience allowlist is empty", () => {
    expect(
      matchLarkSubstituteMode({
        modes: [mode({ audienceAllowlist: [] })],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, chatType: "p2p", mentions: [] },
        directory,
      }),
    ).toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [mode({ audienceAllowlist: [] })],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toBeNull();
  });

  test("supports split lists, all rules, and AI group classification context", () => {
    expect(
      matchLarkSubstituteMode({
        modes: [
          mode({
            audienceAllowlist: [
              { id: "group-ai", type: "group_ai_category", description: "研发协作群" },
            ],
            audienceDenylist: [
              { id: "group-deny", type: "group_ai_category", description: "闲聊群" },
            ],
            questionAllowlist: [{ id: "question-allow", description: "研发问题" }],
            questionDenylist: [{ id: "question-deny", description: "薪酬问题" }],
          }),
        ],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toMatchObject({
      questionAllowRules: ["研发问题"],
      questionDenyRules: ["薪酬问题"],
      groupAllowRules: ["研发协作群"],
      groupDenyRules: ["闲聊群"],
      groupContext: { chatId: "oc_group", name: "研发一群" },
    });

    expect(
      matchLarkSubstituteMode({
        modes: [
          mode({
            audienceAllowlist: [{ id: "all", type: "all" }],
            audienceDenylist: [],
            questionAllowlist: [],
            questionDenylist: [],
          }),
        ],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).not.toBeNull();
  });

  test("matches two-layer audience lists with OR inside layers, AND between layers, and OR between lists", () => {
    const configured = mode({
      audienceAllowRuleGroups: [
        {
          id: "engineering-alice-or-bob",
          conversationRules: [
            {
              id: "engineering",
              type: "group",
              chatId: "oc_group",
              groupId: "group-1",
              name: "研发一群",
            },
            { id: "private", type: "private" },
          ],
          userRules: [
            {
              id: "alice-name",
              type: "user_name",
              name: "张三",
              openId: null,
              email: null,
            },
            {
              id: "bob-email",
              type: "user_email",
              email: "lisi@example.com",
              openId: null,
              name: null,
            },
          ],
        },
        {
          id: "all-ops-users",
          conversationRules: [{ id: "ops", type: "group_name_regex", pattern: "^运维" }],
          userRules: [{ id: "all-users", type: "all_users" }],
        },
      ],
      audienceDenyRuleGroups: [],
    });

    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, openId: "ou_unknown", displayName: "王五" },
        directory,
      }),
    ).toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, chatType: "p2p", mentions: [], displayName: "张三" },
        directory,
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, chatId: "oc_other" },
        directory: {
          ...directory,
          chats: [
            ...directory.chats,
            {
              appId: "cli_test",
              chatId: "oc_other",
              groupId: null,
              name: "运维值班群",
              updatedAt: "2026-09-04T00:00:00.000Z",
            },
          ],
        },
      }),
    ).not.toBeNull();
  });

  test("applies a two-layer deny list only when both layers match", () => {
    const configured = mode({
      audienceAllowRuleGroups: [
        {
          id: "all-groups",
          conversationRules: [{ id: "all-groups", type: "all_groups" }],
          userRules: [{ id: "all-users", type: "all_users" }],
        },
      ],
      audienceDenyRuleGroups: [
        {
          id: "blocked-user-in-engineering",
          conversationRules: [
            {
              id: "engineering",
              type: "group",
              chatId: "oc_group",
              groupId: "group-1",
              name: "研发一群",
            },
          ],
          userRules: [
            {
              id: "blocked-email",
              type: "user_email",
              email: "lisi@example.com",
              openId: null,
              name: null,
            },
          ],
        },
      ],
    });

    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, chatId: "oc_other" },
        directory,
      }),
    ).not.toBeNull();
  });

  test("only forwards AI group classifications from lists whose user layer matches", () => {
    const configured = mode({
      audienceAllowRuleGroups: [
        {
          id: "engineering-for-lisi",
          conversationRules: [
            { id: "engineering-ai", type: "group_ai_category", description: "研发协作群" },
          ],
          userRules: [
            {
              id: "lisi-email",
              type: "user_email",
              email: "lisi@example.com",
              openId: null,
              name: null,
            },
          ],
        },
        {
          id: "finance-for-others",
          conversationRules: [
            { id: "finance-ai", type: "group_ai_category", description: "财务协作群" },
          ],
          userRules: [
            {
              id: "other-email",
              type: "user_email",
              email: "other@example.com",
              openId: null,
              name: null,
            },
          ],
        },
      ],
      audienceDenyRuleGroups: [],
    });

    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toMatchObject({ groupAllowRules: ["研发协作群"] });
  });

  test("matches bot messages by sender App ID and keeps all-users limited to people", () => {
    const botEvent = {
      ...groupEvent,
      openId: "ou_alert_bot",
      displayName: "告警机器人",
      senderType: "app",
      senderAppId: "cli_alert",
    };
    const botMode = mode({
      audienceAllowRuleGroups: [
        {
          id: "specific-bot",
          conversationRules: [{ id: "bot", type: "bot" }],
          userRules: [{ id: "bot-app", type: "bot_app_id", appId: "cli_alert" }],
        },
      ],
      audienceDenyRuleGroups: [],
    });

    expect(
      matchLarkSubstituteMode({
        modes: [botMode],
        botId: "bot-1",
        appId: "cli_test",
        event: botEvent,
        directory,
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [botMode],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...botEvent, senderAppId: "cli_other" },
        directory,
      }),
    ).toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [
          mode({
            audienceAllowRuleGroups: [
              {
                id: "people-only",
                conversationRules: [{ id: "all", type: "all" }],
                userRules: [{ id: "all-users", type: "all_users" }],
              },
            ],
            audienceDenyRuleGroups: [],
          }),
        ],
        botId: "bot-1",
        appId: "cli_test",
        event: botEvent,
        directory,
      }),
    ).toBeNull();
  });

  test("matches users by open_id and bot senders by bot name", () => {
    const openIdMode = mode({
      audienceAllowRuleGroups: [
        {
          id: "specific-user",
          conversationRules: [{ id: "all", type: "all" }],
          userRules: [
            {
              id: "open-id",
              type: "user_open_id",
              openId: "ou_sender",
              name: "旧名称",
              email: null,
            },
          ],
        },
      ],
      audienceDenyRuleGroups: [],
    });
    expect(
      matchLarkSubstituteMode({
        modes: [openIdMode],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, displayName: "已改名" },
        directory,
      }),
    ).not.toBeNull();

    const botNameMode = mode({
      audienceAllowRuleGroups: [
        {
          id: "specific-bot-name",
          conversationRules: [{ id: "bot", type: "bot" }],
          userRules: [{ id: "bot-name", type: "bot_name", name: "告警机器人" }],
        },
      ],
      audienceDenyRuleGroups: [],
    });
    expect(
      matchLarkSubstituteMode({
        modes: [botNameMode],
        botId: "bot-1",
        appId: "cli_test",
        event: {
          ...groupEvent,
          senderType: "bot",
          senderAppId: "cli_alert",
          displayName: "告警机器人",
        },
        directory,
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [botNameMode],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...groupEvent, displayName: "告警机器人" },
        directory,
      }),
    ).toBeNull();
  });

  test("requires a bot-authored private message to mention the substitute user", () => {
    const configured = mode({
      audienceAllowRuleGroups: [
        {
          id: "private-bot",
          conversationRules: [{ id: "bot", type: "bot" }],
          userRules: [{ id: "all-bots", type: "all_bots" }],
        },
      ],
      audienceDenyRuleGroups: [],
    });
    const botPrivateEvent = {
      ...groupEvent,
      chatType: "p2p",
      senderType: "bot",
      senderAppId: "cli_alert",
    };

    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: { ...botPrivateEvent, mentions: [] },
        directory,
      }),
    ).toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [configured],
        botId: "bot-1",
        appId: "cli_test",
        event: botPrivateEvent,
        directory,
      }),
    ).not.toBeNull();
  });

  test("supports all bots and all senders in the second layer", () => {
    const allBotsMode = mode({
      audienceAllowRuleGroups: [
        {
          id: "all-bots",
          conversationRules: [{ id: "all-conversations", type: "all" }],
          userRules: [{ id: "all-bots", type: "all_bots" }],
        },
      ],
      audienceDenyRuleGroups: [],
    });
    const botEvent = {
      ...groupEvent,
      senderType: "bot",
      senderAppId: "cli_any",
    };

    expect(
      matchLarkSubstituteMode({
        modes: [allBotsMode],
        botId: "bot-1",
        appId: "cli_test",
        event: botEvent,
        directory,
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [allBotsMode],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).toBeNull();

    const allSendersMode = mode({
      audienceAllowRuleGroups: [
        {
          id: "all-senders",
          conversationRules: [{ id: "all-conversations", type: "all" }],
          userRules: [{ id: "all-senders", type: "all" }],
        },
      ],
      audienceDenyRuleGroups: [],
    });
    expect(
      matchLarkSubstituteMode({
        modes: [allSendersMode],
        botId: "bot-1",
        appId: "cli_test",
        event: botEvent,
        directory,
      }),
    ).not.toBeNull();
    expect(
      matchLarkSubstituteMode({
        modes: [allSendersMode],
        botId: "bot-1",
        appId: "cli_test",
        event: groupEvent,
        directory,
      }),
    ).not.toBeNull();
  });
});
