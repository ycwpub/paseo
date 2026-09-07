import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import { LarkChannelStore } from "./lark-channel-store.js";
import { LarkDirectoryService } from "./lark-directory-service.js";
import { LarkDirectoryStore } from "./lark-directory-store.js";
import type { LarkUserOAuthService } from "./lark-user-oauth-service.js";

describe("LarkDirectoryService", () => {
  let paseoHome: string;
  let channelStore: LarkChannelStore;
  let directoryStore: LarkDirectoryStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-lark-directory-service-"));
    const logger = pino({ level: "silent" });
    channelStore = new LarkChannelStore({ paseoHome, logger });
    channelStore.configure({
      createNew: true,
      appId: "cli_test",
      appSecret: "secret",
    });
    directoryStore = new LarkDirectoryStore({ paseoHome, logger });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  function createService(
    adapter: Partial<LarkChannelClientAdapter>,
    userAccessToken = "u-token",
  ): LarkDirectoryService {
    return new LarkDirectoryService(
      channelStore,
      directoryStore,
      adapter as LarkChannelClientAdapter,
      {
        getStatus: vi.fn(() => ({
          appId: "cli_test",
          authorized: true,
          needsAuthorization: false,
          expiresAt: null,
          refreshTokenExpiresAt: null,
          openId: "ou_owner",
          email: null,
          displayName: "授权用户",
          scope: null,
        })),
        getValidUserAccessToken: vi.fn(async () => userAccessToken),
      } as unknown as LarkUserOAuthService,
    );
  }

  test("resolves normalized emails and persists their Open IDs", async () => {
    const resolveUsersByEmails = vi.fn(async () => [
      { email: "alice@example.com", openId: "ou_alice" },
    ]);
    const resolveUserByOpenId = vi.fn(async () => ({
      email: "alice@example.com",
      openId: "ou_alice",
      displayName: "张三",
    }));
    const service = createService({
      resolveUsersByEmails,
      resolveUserByOpenId,
    });

    await expect(service.resolveUsers("cli_test", [" Alice@Example.com "])).resolves.toMatchObject([
      { email: "alice@example.com", openId: "ou_alice", displayName: "张三" },
    ]);
    expect(resolveUsersByEmails).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test", appSecret: "secret" }),
      ["alice@example.com"],
    );
    expect(service.getState().users).toHaveLength(1);
    expect(resolveUserByOpenId).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test", appSecret: "secret" }),
      "ou_alice",
    );
  });

  test("reports emails that the bot cannot resolve", async () => {
    const service = createService({
      resolveUsersByEmails: vi.fn(async () => [{ email: "alice@example.com", openId: "ou_alice" }]),
    });

    await expect(
      service.resolveUsers("cli_test", ["alice@example.com", "missing@example.com"]),
    ).rejects.toThrow("missing@example.com");
  });

  test("searches visible Lark users by name and persists their Open IDs", async () => {
    const searchUsers = vi.fn(async () => [
      { email: "alice@example.com", openId: "ou_alice", displayName: "张三" },
    ]);
    const service = createService({ searchUsers });

    await expect(service.resolveUsers("cli_test", ["张三"])).resolves.toMatchObject([
      { email: "alice@example.com", openId: "ou_alice", displayName: "张三" },
    ]);
    expect(searchUsers).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test", appSecret: "secret" }),
      "张三",
      "u-token",
    );
  });

  test("refreshes and persists a real email for an observed Open ID", async () => {
    directoryStore.observeUser(
      "cli_test",
      { openId: "ou_alice", displayName: "Lark user" },
      "2026-08-19T00:00:00.000Z",
    );
    const resolveUserByOpenId = vi.fn(async () => ({
      email: "alice@example.com",
      openId: "ou_alice",
      displayName: "Alice",
    }));
    const service = createService({
      resolveUserByOpenId,
    });

    await expect(service.refreshUserByOpenId("cli_test", "ou_alice")).resolves.toMatchObject({
      email: "alice@example.com",
      openId: "ou_alice",
    });
    expect(resolveUserByOpenId).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test", appSecret: "secret" }),
      "ou_alice",
    );
    expect(directoryStore.findUser("cli_test", "ou_alice")).toMatchObject({
      email: "alice@example.com",
    });
  });

  test("resolves an Open ID and adds the user to the directory", async () => {
    const resolveUserByOpenId = vi.fn(async () => ({
      email: "alice@example.com",
      openId: "ou_alice",
      displayName: "张三",
    }));
    const service = createService({ resolveUserByOpenId });

    await expect(service.resolveUserByOpenId("cli_test", " ou_alice ")).resolves.toMatchObject({
      appId: "cli_test",
      email: "alice@example.com",
      openId: "ou_alice",
      displayName: "张三",
    });
    expect(directoryStore.findUser("cli_test", "ou_alice")).toMatchObject({
      email: "alice@example.com",
      displayName: "张三",
    });
  });

  test("adds a visible user when Lark does not expose the email field", async () => {
    const resolveUserByOpenId = vi.fn(async () => ({
      email: null,
      openId: "ou_yuan",
      displayName: "袁昌旺",
    }));
    const service = createService({ resolveUserByOpenId });

    await expect(service.resolveUserByOpenId("cli_test", "ou_yuan")).resolves.toMatchObject({
      appId: "cli_test",
      email: null,
      openId: "ou_yuan",
      displayName: "袁昌旺",
    });
    expect(directoryStore.findUser("cli_test", "ou_yuan")).toMatchObject({
      email: null,
      displayName: "袁昌旺",
    });
  });

  test("scans recent private users without automatically adding them", async () => {
    const searchPrivateMessagesAsUser = vi.fn(async () => [
      {
        message_id: "om_recent",
        chat_id: "oc_private",
        create_time: "1788768000000",
        sender: {
          id: "ou_recent",
          id_type: "open_id",
          sender_type: "user",
          sender_name: "最近联系人",
        },
        body: { content: JSON.stringify({ text: "最近的私聊消息" }) },
      },
    ]);
    const service = createService({ searchPrivateMessagesAsUser });

    await expect(
      service.scanRecentPrivateUsers("cli_test", { lookbackMinutes: 30 }),
    ).resolves.toEqual([
      expect.objectContaining({
        openId: "ou_recent",
        displayName: "最近联系人",
        lastMessageContent: "最近的私聊消息",
        inDirectory: false,
      }),
    ]);
    expect(directoryStore.findUser("cli_test", "ou_recent")).toBeNull();
    expect(searchPrivateMessagesAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test" }),
      expect.objectContaining({
        startTime: expect.any(Number),
        endTime: expect.any(Number),
      }),
      "u-token",
    );
  });

  test("scans private users within an explicit message time range", async () => {
    const searchPrivateMessagesAsUser = vi.fn(async () => []);
    const service = createService({ searchPrivateMessagesAsUser });

    await service.scanRecentPrivateUsers("cli_test", {
      lookbackMinutes: 30,
      startTime: 1_788_729_600,
      endTime: 1_788_733_200,
    });

    expect(searchPrivateMessagesAsUser).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test" }),
      {
        startTime: 1_788_729_600,
        endTime: 1_788_733_200,
      },
      "u-token",
    );
  });

  test("adds a scanned private user and keeps the first message evidence", async () => {
    const service = createService({
      resolveUserByOpenId: vi.fn(async () => null),
    });

    await expect(
      service.addRecentPrivateUser("cli_test", {
        openId: "ou_recent",
        displayName: "最近联系人",
        firstMessageContent: "最近的私聊消息",
        firstMessageAt: "2026-09-07T08:00:00.000Z",
      }),
    ).resolves.toMatchObject({
      openId: "ou_recent",
      displayName: "最近联系人",
      firstMessageContent: "最近的私聊消息",
      firstMessageAt: "2026-09-07T08:00:00.000Z",
    });
  });

  test("returns an existing complete contact without querying Lark again", async () => {
    directoryStore.upsertResolvedUsers(
      "cli_test",
      [{ email: "yuan@example.com", openId: "ou_yuan", displayName: "袁昌旺" }],
      "2026-09-07T08:00:00.000Z",
    );
    const resolveUserByOpenId = vi.fn();
    const service = createService({ resolveUserByOpenId });

    await expect(service.resolveUserByOpenId("cli_test", "ou_yuan")).resolves.toMatchObject({
      email: "yuan@example.com",
      openId: "ou_yuan",
      displayName: "袁昌旺",
    });
    expect(resolveUserByOpenId).not.toHaveBeenCalled();
  });

  test("reports an Open ID that is not visible to the bot", async () => {
    const service = createService({
      resolveUserByOpenId: vi.fn(async () => null),
    });

    await expect(service.resolveUserByOpenId("cli_test", "ou_missing")).rejects.toThrow(
      "飞书未返回用户 ou_missing 的可见资料",
    );
  });

  test("records the first message timestamp when observing a contact", () => {
    const service = createService({});
    const createTime = 1788656400000;

    service.observeUser("cli_test", "ou_alice", "Alice", null, {
      content: "请帮忙确认这笔订单",
      createTime,
    });

    expect(directoryStore.findUser("cli_test", "ou_alice")).toMatchObject({
      firstMessageContent: "请帮忙确认这笔订单",
      firstMessageAt: new Date(createTime).toISOString(),
    });
  });

  test("clears every stored first message for one configured bot", () => {
    const service = createService({});
    service.observeUser("cli_test", "ou_alice", "Alice", null, {
      content: "第一条消息",
      createTime: 1788656400000,
    });
    service.observeUser("cli_test", "ou_bob", "Bob", null, {
      content: "另一条消息",
      createTime: 1788656500000,
    });

    expect(service.clearFirstMessageContents("cli_test")).toBe(2);
    expect(service.getState().users).toEqual([
      expect.objectContaining({ openId: "ou_alice", firstMessageContent: null }),
      expect.objectContaining({ openId: "ou_bob", firstMessageContent: null }),
    ]);
  });

  test("creates and deletes local contacts for a configured bot", () => {
    const service = createService({});
    expect(
      service.createUser("cli_test", "ou_alice", {
        displayName: "张三",
        email: "alice@example.com",
      }),
    ).toMatchObject({
      appId: "cli_test",
      openId: "ou_alice",
      displayName: "张三",
      email: "alice@example.com",
    });

    expect(service.deleteUsers("cli_test", ["ou_alice", "ou_missing"])).toEqual(["ou_alice"]);
    expect(service.getState().users).toEqual([]);
  });

  test("does not query Lark again when the email is already known", async () => {
    directoryStore.upsertResolvedUsers(
      "cli_test",
      [{ email: "alice@example.com", openId: "ou_alice", displayName: "张三" }],
      "2026-08-19T00:00:00.000Z",
    );
    const resolveUserByOpenId = vi.fn();
    const service = createService({
      resolveUserByOpenId,
    });

    await expect(service.refreshUserByOpenId("cli_test", "ou_alice")).resolves.toMatchObject({
      email: "alice@example.com",
    });
    expect(resolveUserByOpenId).not.toHaveBeenCalled();
  });

  test("refreshes a generic display name even when the email is already known", async () => {
    directoryStore.upsertResolvedUsers(
      "cli_test",
      [{ email: "alice@example.com", openId: "ou_alice", displayName: "Lark user" }],
      "2026-08-19T00:00:00.000Z",
    );
    const resolveUserByOpenId = vi.fn(async () => ({
      email: "alice@example.com",
      openId: "ou_alice",
      displayName: "张三",
    }));
    const service = createService({ resolveUserByOpenId });

    await expect(service.refreshUserByOpenId("cli_test", "ou_alice")).resolves.toMatchObject({
      email: "alice@example.com",
      openId: "ou_alice",
      displayName: "张三",
    });
    expect(resolveUserByOpenId).toHaveBeenCalledTimes(1);
  });

  test("returns all matching groups so the UI can disambiguate them", async () => {
    const resolveChats = vi.fn(async () => [
      { groupId: "group_one", chatId: "oc_one", name: "结算群" },
      { groupId: "group_two", chatId: "oc_two", name: "结算群" },
    ]);
    const getValidUserAccessToken = vi.fn(async () => "u-token");
    const service = new LarkDirectoryService(
      channelStore,
      directoryStore,
      { resolveChats } as unknown as LarkChannelClientAdapter,
      { getValidUserAccessToken } as unknown as LarkUserOAuthService,
    );

    await expect(service.resolveChats("cli_test", "结算群")).resolves.toHaveLength(2);
    expect(getValidUserAccessToken).toHaveBeenCalledWith("cli_test", [
      "offline_access",
      "im:chat:read",
    ]);
    expect(resolveChats).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test" }),
      "结算群",
      "u-token",
    );
    expect(service.getState().chats).toHaveLength(2);
  });

  test("requires a user OAuth token and never falls back to the bot identity for group search", async () => {
    const resolveChats = vi.fn();
    const service = new LarkDirectoryService(
      channelStore,
      directoryStore,
      { resolveChats } as unknown as LarkChannelClientAdapter,
      {
        getValidUserAccessToken: vi.fn(async () => {
          throw new Error("请先完成 OAuth 授权");
        }),
      } as unknown as LarkUserOAuthService,
    );

    await expect(service.resolveChats("cli_test", "结算群")).rejects.toThrow("请先完成 OAuth 授权");
    expect(resolveChats).not.toHaveBeenCalled();
  });

  test("passes a direct chat ID to the adapter", async () => {
    const resolveChats = vi.fn(async () => [
      { groupId: "oc_direct", chatId: "oc_direct", name: "直接查询群" },
    ]);
    const service = createService({
      resolveChats,
    });

    await expect(service.resolveChats("cli_test", " oc_direct ")).resolves.toMatchObject([
      { chatId: "oc_direct", name: "直接查询群" },
    ]);
    expect(resolveChats).toHaveBeenCalledWith(expect.any(Object), "oc_direct", "u-token");
  });

  test("refreshes a group by chat ID and replaces an observed placeholder name", async () => {
    directoryStore.upsertChats(
      "cli_test",
      [{ groupId: "oc_direct", chatId: "oc_direct", name: "@机器人 帮我处理问题" }],
      "2026-08-19T00:00:00.000Z",
    );
    const resolveChats = vi.fn(async () => [
      { groupId: "group_settlement", chatId: "oc_direct", name: "结算研发群" },
    ]);
    const service = createService({
      resolveChats,
    });

    await expect(
      service.refreshChatById("cli_test", "oc_direct", { force: true }),
    ).resolves.toMatchObject({
      groupId: "group_settlement",
      chatId: "oc_direct",
      name: "结算研发群",
    });
    expect(directoryStore.findChat("cli_test", "oc_direct")).toMatchObject({
      groupId: "group_settlement",
      name: "结算研发群",
    });
  });
});
