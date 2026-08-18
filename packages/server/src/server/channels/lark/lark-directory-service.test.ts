import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test, vi } from "vitest";
import type { LarkChannelClientAdapter } from "./lark-client-adapter.js";
import { LarkChannelStore } from "./lark-channel-store.js";
import { LarkDirectoryService } from "./lark-directory-service.js";
import { LarkDirectoryStore } from "./lark-directory-store.js";

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

  test("resolves normalized emails and persists their Open IDs", async () => {
    const resolveUsersByEmails = vi.fn(async () => [
      { email: "alice@example.com", openId: "ou_alice" },
    ]);
    const service = new LarkDirectoryService(channelStore, directoryStore, {
      resolveUsersByEmails,
    } as unknown as LarkChannelClientAdapter);

    await expect(service.resolveUsers("cli_test", [" Alice@Example.com "])).resolves.toMatchObject([
      { email: "alice@example.com", openId: "ou_alice" },
    ]);
    expect(resolveUsersByEmails).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test", appSecret: "secret" }),
      ["alice@example.com"],
    );
    expect(service.getState().users).toHaveLength(1);
  });

  test("reports emails that the bot cannot resolve", async () => {
    const service = new LarkDirectoryService(channelStore, directoryStore, {
      resolveUsersByEmails: vi.fn(async () => [{ email: "alice@example.com", openId: "ou_alice" }]),
    } as unknown as LarkChannelClientAdapter);

    await expect(
      service.resolveUsers("cli_test", ["alice@example.com", "missing@example.com"]),
    ).rejects.toThrow("missing@example.com");
  });

  test("returns all matching groups so the UI can disambiguate them", async () => {
    const resolveChats = vi.fn(async () => [
      { groupId: "group_one", chatId: "oc_one", name: "结算群" },
      { groupId: "group_two", chatId: "oc_two", name: "结算群" },
    ]);
    const service = new LarkDirectoryService(channelStore, directoryStore, {
      resolveChats,
    } as unknown as LarkChannelClientAdapter);

    await expect(service.resolveChats("cli_test", "结算群")).resolves.toHaveLength(2);
    expect(resolveChats).toHaveBeenCalledWith(
      expect.objectContaining({ appId: "cli_test" }),
      "结算群",
    );
    expect(service.getState().chats).toHaveLength(2);
  });

  test("passes a direct chat ID to the adapter", async () => {
    const resolveChats = vi.fn(async () => [
      { groupId: "oc_direct", chatId: "oc_direct", name: "直接查询群" },
    ]);
    const service = new LarkDirectoryService(channelStore, directoryStore, {
      resolveChats,
    } as unknown as LarkChannelClientAdapter);

    await expect(service.resolveChats("cli_test", " oc_direct ")).resolves.toMatchObject([
      { chatId: "oc_direct", name: "直接查询群" },
    ]);
    expect(resolveChats).toHaveBeenCalledWith(expect.any(Object), "oc_direct");
  });
});
