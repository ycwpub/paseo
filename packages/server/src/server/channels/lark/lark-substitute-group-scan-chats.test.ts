import { describe, expect, test } from "vitest";
import type { LarkDirectoryChat, LarkSubstituteMode } from "@getpaseo/protocol/messages";
import { selectLarkSubstituteGroupScanChats } from "./lark-substitute-group-scan-chats.js";

function mode(audienceAllowlist: LarkSubstituteMode["audienceAllowlist"]): LarkSubstituteMode {
  return {
    id: "mode-1",
    name: "工作替身",
    enabled: true,
    botId: "bot-1",
    privateScan: {
      enabled: true,
      intervalMinutes: 30,
      lookbackMinutes: 60,
      excludeRecentMinutes: 10,
    },
    disclosure: { enabled: true, prompt: "【机器人代答】" },
    customPrompt: "",
    delaySeconds: 600,
    activeTimeRanges: [],
    audienceAllowlist,
    audienceDenylist: [],
    questionAllowlist: [],
    questionDenylist: [],
    allowlist: [],
    denylist: [],
    target: {
      kind: "workspace",
      provider: "aiden_codex",
      model: "gpt-5.5",
      cwd: "/repo",
      workspaceId: null,
    },
    createdAt: "2026-09-07T00:00:00.000Z",
    updatedAt: "2026-09-07T00:00:00.000Z",
  };
}

const chats: LarkDirectoryChat[] = [
  {
    appId: "cli_test",
    chatId: "oc_research",
    groupId: null,
    name: "研发群",
    updatedAt: "2026-09-07T00:00:00.000Z",
  },
  {
    appId: "cli_test",
    chatId: "oc_ops",
    groupId: null,
    name: "运维群",
    updatedAt: "2026-09-07T00:00:00.000Z",
  },
  {
    appId: "cli_other",
    chatId: "oc_other",
    groupId: null,
    name: "其他机器人群",
    updatedAt: "2026-09-07T00:00:00.000Z",
  },
];

describe("selectLarkSubstituteGroupScanChats", () => {
  test("does not scan any group when the group allowlist is empty", () => {
    expect(selectLarkSubstituteGroupScanChats(mode([]), "cli_test", chats)).toEqual([]);
  });

  test("scans explicit groups and known groups selected by name regex", () => {
    expect(
      selectLarkSubstituteGroupScanChats(
        mode([
          { id: "explicit", type: "group", chatId: "oc_explicit", groupId: null, name: "指定群" },
          { id: "regex", type: "group_name_regex", pattern: "^研发" },
        ]),
        "cli_test",
        chats,
      ),
    ).toEqual([
      { chatId: "oc_explicit", name: "指定群" },
      { chatId: "oc_research", name: "研发群" },
    ]);
  });

  test("scans all known groups for all-group and AI audience rules", () => {
    expect(
      selectLarkSubstituteGroupScanChats(
        mode([{ id: "ai", type: "group_ai_category", description: "工作群" }]),
        "cli_test",
        chats,
      ),
    ).toHaveLength(2);
    expect(
      selectLarkSubstituteGroupScanChats(mode([{ id: "all", type: "all" }]), "cli_test", chats),
    ).toHaveLength(2);
  });

  test("scans all known groups when the first layer targets bot messages", () => {
    const configured = mode([]);
    configured.audienceAllowRuleGroups = [
      {
        id: "bots",
        conversationRules: [{ id: "bot", type: "bot" }],
        userRules: [{ id: "all-bots", type: "all_bots" }],
      },
    ];

    expect(selectLarkSubstituteGroupScanChats(configured, "cli_test", chats)).toHaveLength(2);
  });

  test("does not treat a private-user allow rule as a group allow rule", () => {
    expect(
      selectLarkSubstituteGroupScanChats(
        mode([
          {
            id: "user",
            type: "user",
            openId: "ou_user",
            name: "用户",
            email: null,
          },
        ]),
        "cli_test",
        chats,
      ),
    ).toEqual([]);
  });

  test("discovers groups from the first layer of two-layer allow lists", () => {
    const configured = mode([]);
    configured.audienceAllowRuleGroups = [
      {
        id: "explicit-or-regex",
        conversationRules: [
          {
            id: "explicit",
            type: "group",
            chatId: "oc_explicit",
            groupId: null,
            name: "指定群",
          },
          { id: "regex", type: "group_name_regex", pattern: "^研发" },
        ],
        userRules: [
          {
            id: "email",
            type: "user_email",
            email: "user@example.com",
            openId: null,
            name: null,
          },
        ],
      },
    ];

    expect(selectLarkSubstituteGroupScanChats(configured, "cli_test", chats)).toEqual([
      { chatId: "oc_explicit", name: "指定群" },
      { chatId: "oc_research", name: "研发群" },
    ]);
  });
});
