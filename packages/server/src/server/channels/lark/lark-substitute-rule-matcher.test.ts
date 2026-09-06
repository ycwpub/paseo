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
        modes: [mode()],
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
});
