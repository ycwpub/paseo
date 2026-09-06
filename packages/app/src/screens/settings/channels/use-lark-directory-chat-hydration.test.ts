import { describe, expect, test } from "vitest";
import { collectIncompleteLarkChatIds } from "./use-lark-directory-chat-hydration";

const completeChat = {
  appId: "cli_test",
  groupId: "7160881741501267996",
  chatId: "oc_complete",
  name: "结算群",
  updatedAt: "2026-09-06T00:00:00.000Z",
};

describe("collectIncompleteLarkChatIds", () => {
  test("returns missing and placeholder group identities for the selected bot", () => {
    expect(
      collectIncompleteLarkChatIds({
        appId: "cli_test",
        chatIds: ["oc_missing", "oc_placeholder", "oc_complete", "oc_missing"],
        chats: [
          completeChat,
          {
            ...completeChat,
            groupId: "oc_placeholder",
            chatId: "oc_placeholder",
            name: "旧群名称",
          },
          {
            ...completeChat,
            appId: "cli_other",
            chatId: "oc_missing",
          },
        ],
      }),
    ).toEqual(["oc_missing", "oc_placeholder"]);
  });

  test("returns no IDs without a bot App ID", () => {
    expect(
      collectIncompleteLarkChatIds({
        appId: null,
        chatIds: ["oc_missing"],
        chats: [],
      }),
    ).toEqual([]);
  });
});
