import { describe, expect, test, vi } from "vitest";
import type { StoredLarkChannelConfig } from "./lark-channel-store.js";
import { LarkSubstituteReplySender } from "./lark-substitute-reply-sender.js";

const config: StoredLarkChannelConfig = {
  enabled: true,
  appId: "cli_test",
  appSecret: "secret",
  encryptKey: null,
  verificationToken: null,
  domain: "feishu",
  target: {
    kind: "workspace",
    provider: "aiden_codex",
    model: "gpt-5.5",
    cwd: "/repo",
    workspaceId: null,
  },
  substitute: { enabled: false, openId: null, name: null },
};

const userTrigger = {
  source: "private_message" as const,
  configuredTarget: { openId: "ou_target", name: "张三" },
  observedMention: {
    key: null,
    name: "张三",
    openId: "ou_target",
    userId: null,
    appId: null,
    idType: "open_id",
  },
  replyIdentity: "user" as const,
};

describe("LarkSubstituteReplySender", () => {
  test("uses the refreshed OAuth token for private substitute replies", async () => {
    const adapter = {
      replyToMessageInThread: vi.fn(),
      replyToMessageInThreadAsUser: vi.fn(async () => ({
        threadId: "omt_1",
        messageId: "om_2",
      })),
      replyInThread: vi.fn(),
      replyInThreadAsUser: vi.fn(),
    };
    const oauth = { getValidUserAccessToken: vi.fn(async () => "user-token") };
    const sender = new LarkSubstituteReplySender(adapter, oauth);

    await expect(
      sender.replyToMessageInThread(config, "om_1", "收到消息，处理中", userTrigger),
    ).resolves.toEqual({ threadId: "omt_1", messageId: "om_2" });
    expect(oauth.getValidUserAccessToken).toHaveBeenCalledWith("cli_test");
    expect(adapter.replyToMessageInThreadAsUser).toHaveBeenCalledWith(
      config,
      "om_1",
      "收到消息，处理中",
      "user-token",
    );
    expect(adapter.replyToMessageInThread).not.toHaveBeenCalled();
  });

  test("keeps robot replies on the bot API", async () => {
    const adapter = {
      replyToMessageInThread: vi.fn(),
      replyToMessageInThreadAsUser: vi.fn(),
      replyInThread: vi.fn(async () => ({ threadId: "omt_1", messageId: "om_3" })),
      replyInThreadAsUser: vi.fn(),
    };
    const sender = new LarkSubstituteReplySender(adapter, null);
    await sender.replyInThread(config, "om_1", "答案", {
      ...userTrigger,
      replyIdentity: "bot",
    });
    expect(adapter.replyInThread).toHaveBeenCalledWith(config, "om_1", "答案");
    expect(adapter.replyInThreadAsUser).not.toHaveBeenCalled();
  });
});
