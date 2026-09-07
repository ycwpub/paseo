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

  test("clears all first message content for the selected bot", async () => {
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
      directory: { users: [], chats: [] },
    } as const;
    const service = {
      clearDirectoryFirstMessageContents: vi.fn(() => 3),
      getStatus: vi.fn(() => status),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.directory.clear_first_messages.request",
      requestId: "clear-first-messages",
      appId: "cli_test",
    });

    expect(service.clearDirectoryFirstMessageContents).toHaveBeenCalledWith("cli_test");
    expect(emit).toHaveBeenCalledWith({
      type: "channel.lark.directory.clear_first_messages.response",
      payload: {
        requestId: "clear-first-messages",
        clearedCount: 3,
        status,
        error: null,
      },
    });
  });

  test("scans recent private users and adds a selected result", async () => {
    const candidate = {
      appId: "cli_test",
      openId: "ou_recent",
      displayName: "李四",
      firstMessageContent: "你好",
      firstMessageAt: "2026-09-07T08:00:00.000Z",
      lastMessageContent: "请帮忙看一下",
      lastMessageAt: "2026-09-07T08:10:00.000Z",
      messageCount: 2,
      inDirectory: false,
    };
    const user = {
      appId: "cli_test",
      openId: "ou_recent",
      displayName: "李四",
      email: null,
      firstMessageContent: "你好",
      firstMessageAt: "2026-09-07T08:00:00.000Z",
      updatedAt: "2026-09-07T08:15:00.000Z",
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
      scanRecentDirectoryPrivateUsers: vi.fn(async () => [candidate]),
      addRecentDirectoryPrivateUser: vi.fn(async () => user),
      getStatus: vi.fn(() => status),
    } as unknown as LarkChannelService;
    const emit = vi.fn();
    const session = new LarkChannelSession({
      host: { emit },
      service,
      logger: pino({ level: "silent" }),
    });

    await session.handleRequest({
      type: "channel.lark.directory.scan_private_users.request",
      requestId: "scan-private-users",
      appId: "cli_test",
      lookbackMinutes: 30,
    });
    await session.handleRequest({
      type: "channel.lark.directory.add_private_user.request",
      requestId: "add-private-user",
      appId: "cli_test",
      openId: candidate.openId,
      displayName: candidate.displayName,
      firstMessageContent: candidate.firstMessageContent,
      firstMessageAt: candidate.firstMessageAt,
    });

    expect(service.scanRecentDirectoryPrivateUsers).toHaveBeenCalledWith("cli_test", 30);
    expect(service.addRecentDirectoryPrivateUser).toHaveBeenCalledWith("cli_test", {
      openId: candidate.openId,
      displayName: candidate.displayName,
      firstMessageContent: candidate.firstMessageContent,
      firstMessageAt: candidate.firstMessageAt,
    });
    expect(emit).toHaveBeenNthCalledWith(1, {
      type: "channel.lark.directory.scan_private_users.response",
      payload: {
        requestId: "scan-private-users",
        users: [candidate],
        error: null,
      },
    });
    expect(emit).toHaveBeenNthCalledWith(2, {
      type: "channel.lark.directory.add_private_user.response",
      payload: {
        requestId: "add-private-user",
        user,
        status,
        error: null,
      },
    });
  });
});
