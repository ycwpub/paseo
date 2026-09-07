import { describe, expect, test } from "vitest";
import { collectRecentLarkPrivateUsers } from "./lark-directory-private-user-scan.js";

function privateMessage(
  messageId: string,
  openId: string,
  displayName: string,
  content: string,
  createTime: number,
) {
  return {
    message_id: messageId,
    chat_id: `oc_${openId}`,
    chat_type: "p2p",
    create_time: String(createTime),
    sender: {
      id: openId,
      id_type: "open_id",
      sender_type: "user",
      sender_name: displayName,
    },
    body: { content: JSON.stringify({ text: content }) },
  };
}

describe("collectRecentLarkPrivateUsers", () => {
  test("treats message details without chat_type as private search results", () => {
    const message = privateMessage(
      "om_without_chat_type",
      "ou_alice",
      "张三",
      "最近的私聊消息",
      1_788_768_000_000,
    );
    delete (message as { chat_type?: string }).chat_type;

    const users = collectRecentLarkPrivateUsers({
      appId: "cli_test",
      rawMessages: [message],
      currentUserOpenId: "ou_owner",
      directory: { users: [], chats: [] },
      now: "2026-09-07T08:30:00.000Z",
    });

    expect(users).toEqual([
      expect.objectContaining({
        openId: "ou_alice",
        displayName: "张三",
        lastMessageContent: "最近的私聊消息",
      }),
    ]);
  });

  test("still rejects messages explicitly identified as group messages", () => {
    const message = privateMessage("om_group", "ou_alice", "张三", "群消息", 1_788_768_000_000);
    message.chat_type = "group";

    const users = collectRecentLarkPrivateUsers({
      appId: "cli_test",
      rawMessages: [message],
      currentUserOpenId: "ou_owner",
      directory: { users: [], chats: [] },
      now: "2026-09-07T08:30:00.000Z",
    });

    expect(users).toEqual([]);
  });

  test("groups recent private messages by peer and excludes the authorized user", () => {
    const users = collectRecentLarkPrivateUsers({
      appId: "cli_test",
      rawMessages: [
        privateMessage("om_1", "ou_alice", "张三", "第一条", 1_788_768_000_000),
        privateMessage("om_2", "ou_owner", "授权用户", "我的回复", 1_788_768_030_000),
        privateMessage("om_3", "ou_alice", "张三", "第二条", 1_788_768_060_000),
        privateMessage("om_4", "ou_existing", "李四", "已有联系人", 1_788_768_090_000),
      ],
      currentUserOpenId: "ou_owner",
      directory: {
        users: [
          {
            appId: "cli_test",
            openId: "ou_existing",
            displayName: "李四",
            email: null,
            firstMessageContent: null,
            firstMessageAt: null,
            updatedAt: "2026-09-07T08:00:00.000Z",
          },
        ],
        chats: [],
      },
      now: "2026-09-07T08:30:00.000Z",
    });

    expect(users).toEqual([
      expect.objectContaining({
        openId: "ou_existing",
        inDirectory: true,
        messageCount: 1,
      }),
      expect.objectContaining({
        openId: "ou_alice",
        displayName: "张三",
        firstMessageContent: "第一条",
        lastMessageContent: "第二条",
        messageCount: 2,
        inDirectory: false,
      }),
    ]);
  });
});
