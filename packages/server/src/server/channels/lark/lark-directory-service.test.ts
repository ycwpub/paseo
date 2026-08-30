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
    const service = createService({
      resolveChats,
    });

    await expect(service.resolveChats("cli_test", "结算群")).resolves.toHaveLength(2);
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
