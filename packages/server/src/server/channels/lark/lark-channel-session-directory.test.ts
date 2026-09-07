import pino from "pino";
import { describe, expect, test, vi } from "vitest";
import type { LarkChannelService } from "./lark-channel-service.js";
import { LarkChannelSession } from "./lark-channel-session.js";

describe("LarkChannelSession directory RPC", () => {
  test("resolves an Open ID and returns the added contact", async () => {
    const user = {
      appId: "cli_test",
      openId: "ou_alice",
      displayName: "张三",
      email: "alice@example.com",
      firstMessageContent: null,
      firstMessageAt: null,
      updatedAt: "2026-09-07T02:00:00.000Z",
    };
    const status = {
      enabled: false,
      connectionStatus: "disabled",
      error: null,
      appId: null,
      hasAppSecret: false,
      hasEncryptKey: false,
      hasVerificationToken: false,
      domain: "feishu",
      target: {
        kind: "workspace",
        provider: null,
        model: null,
        modeId: null,
        thinkingOptionId: null,
        cwd: null,
        workspaceId: null,
      },
      substitute: { enabled: false, openId: null, name: null },
      bot: null,
      pendingPairings: [],
      authorizedUsers: [],
      activeBotId: null,
      bots: [],
      directory: { users: [user], chats: [] },
    } as const;
    const service = {
      resolveDirectoryUser: vi.fn(async () => user),
      getStatus: vi.fn(() => status),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.directory.resolve_user.request",
      requestId: "resolve-contact",
      appId: "cli_test",
      openId: "ou_alice",
    });

    expect(service.resolveDirectoryUser).toHaveBeenCalledWith("cli_test", "ou_alice");
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.directory.resolve_user.response",
      payload: {
        requestId: "resolve-contact",
        user,
        status,
        error: null,
      },
    });
  });

  test("updates a contact and returns the refreshed channel status", async () => {
    const user = {
      appId: "cli_test",
      openId: "ou_alice",
      displayName: "张三",
      email: "alice@example.com",
      firstMessageContent: "请帮忙看一下",
      firstMessageAt: "2026-09-06T01:00:00.000Z",
      updatedAt: "2026-09-06T02:00:00.000Z",
    };
    const status = {
      enabled: false,
      connectionStatus: "disabled",
      error: null,
      appId: null,
      hasAppSecret: false,
      hasEncryptKey: false,
      hasVerificationToken: false,
      domain: "feishu",
      target: {
        kind: "workspace",
        provider: null,
        model: null,
        modeId: null,
        thinkingOptionId: null,
        cwd: null,
        workspaceId: null,
      },
      substitute: { enabled: false, openId: null, name: null },
      bot: null,
      pendingPairings: [],
      authorizedUsers: [],
      activeBotId: null,
      bots: [],
      directory: { users: [user], chats: [] },
    } as const;
    const service = {
      updateDirectoryUser: vi.fn(() => user),
      getStatus: vi.fn(() => status),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.directory.update_user.request",
      requestId: "update-contact",
      appId: "cli_test",
      openId: "ou_alice",
      displayName: "张三",
      email: "alice@example.com",
    });

    expect(service.updateDirectoryUser).toHaveBeenCalledWith("cli_test", "ou_alice", {
      displayName: "张三",
      email: "alice@example.com",
    });
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.directory.update_user.response",
      payload: {
        requestId: "update-contact",
        user,
        status,
        error: null,
      },
    });
  });
});
