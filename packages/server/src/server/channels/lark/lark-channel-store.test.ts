import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { LarkChannelStore } from "./lark-channel-store.js";

describe("LarkChannelStore", () => {
  let paseoHome: string;
  let store: LarkChannelStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-lark-channel-"));
    store = new LarkChannelStore({ paseoHome, logger: pino({ level: "silent" }) });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("persists secrets but returns only redacted status", async () => {
    store.configure({
      appId: "cli_test",
      appSecret: "secret",
      encryptKey: "encrypt",
      verificationToken: "token",
      substitute: {
        enabled: true,
        openId: " ou_alice ",
        name: " Alice ",
      },
      target: {
        kind: "workspace",
        provider: "claude",
        model: "sonnet",
        modeId: "accept-edits",
        thinkingOptionId: "high",
        cwd: "/repo/app",
        workspaceId: "ws-1",
      },
    });

    const status = store.getStatus();
    expect(status).toMatchObject({
      activeBotId: expect.any(String),
      appId: "cli_test",
      hasAppSecret: true,
      hasEncryptKey: true,
      hasVerificationToken: true,
      target: {
        kind: "workspace",
        provider: "claude",
        model: "sonnet",
        modeId: "accept-edits",
        thinkingOptionId: "high",
        cwd: "/repo/app",
        workspaceId: "ws-1",
      },
      substitute: {
        enabled: true,
        openId: "ou_alice",
        name: "Alice",
      },
    });
    expect(status.bots).toHaveLength(1);
    expect(status.bots[0]).toMatchObject({ appId: "cli_test" });
    expect(JSON.stringify(status)).not.toContain("secret");
    expect(JSON.stringify(status)).not.toContain("encrypt");
    expect(JSON.stringify(status)).not.toContain("token");

    const raw = await readFile(store.getFilePath(), "utf8");
    expect(raw).toContain("secret");
    expect(raw).toContain("ou_alice");
  });

  test("omitted secret fields preserve existing values", () => {
    store.configure({ appId: "cli_test", appSecret: "secret" });
    store.configure({ appId: "cli_next" });

    const payload = store.getPayload();
    expect(payload.bots[0]?.config.appId).toBe("cli_next");
    expect(payload.bots[0]?.config.appSecret).toBe("secret");
  });

  test("requires an Open ID when substitute mode is enabled", () => {
    expect(() =>
      store.configure({
        substitute: {
          enabled: true,
          openId: " ",
          name: "Alice",
        },
      }),
    ).toThrow("Substitute Open ID is required");
  });

  test("persists a team target", () => {
    store.configure({
      target: {
        kind: "team",
        teamId: "team-delivery",
        provider: "claude",
        model: "sonnet",
        modeId: "accept-edits",
        thinkingOptionId: "high",
        cwd: "/repo/app",
        workspaceId: "ws-1",
      },
    });

    expect(store.getStatus().target).toEqual({
      kind: "team",
      teamId: "team-delivery",
      provider: "claude",
      model: "sonnet",
      modeId: "accept-edits",
      thinkingOptionId: "high",
      cwd: "/repo/app",
      workspaceId: "ws-1",
    });
  });

  test("approves and revokes pending pairings", () => {
    const bot = store.configure({ name: "Support bot" });
    const pairing = store.upsertPendingPairing(bot.id, {
      openId: "ou_1",
      unionId: null,
      chatId: "oc_1",
      displayName: "Alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
    });

    const user = store.approvePairing(bot.id, pairing.code, "2026-01-01T00:01:00.000Z");
    expect(user?.displayName).toBe("Alice");
    expect(store.getStatus().pendingPairings).toEqual([]);
    expect(store.getStatus().authorizedUsers).toHaveLength(1);

    expect(store.revokeUser(bot.id, user!.id)).toBe(true);
    expect(store.getStatus().authorizedUsers).toEqual([]);
  });

  test("finds the authorized human for a bot turn in the same chat", () => {
    const bot = store.configure({ name: "Support bot" });
    const pairing = store.upsertPendingPairing(bot.id, {
      openId: "ou_alice",
      unionId: "on_alice",
      chatId: "oc_team",
      displayName: "Alice",
      createdAt: "2026-01-01T00:00:00.000Z",
      expiresAt: "2026-01-01T00:15:00.000Z",
    });
    const user = store.approvePairing(bot.id, pairing.code, "2026-01-01T00:01:00.000Z");

    expect(store.findAuthorizedUserByChat(bot.id, "oc_team")).toEqual(user);
    expect(store.findAuthorizedUserByChat(bot.id, "oc_other")).toBeNull();
  });

  test("records conversations by Lark thread", () => {
    const bot = store.configure({ name: "Support bot" });
    store.recordThreadConversation(bot.id, {
      chatId: "oc_1",
      threadId: "om_thread_1",
      rootMessageId: "om_root_1",
      userId: "user-1",
      agentId: "agent-1",
      title: "Release plan",
      now: "2026-01-01T00:00:00.000Z",
    });

    expect(store.findConversationByThread(bot.id, "oc_1", "om_thread_1")).toMatchObject({
      agentId: "agent-1",
      title: "Release plan",
      lastOutboundAt: null,
    });

    store.markConversationOutbound(
      bot.id,
      "agent-1",
      "oc_1",
      "om_thread_1",
      "2026-01-01T00:02:00.000Z",
    );

    expect(store.findConversationByThread(bot.id, "oc_1", "om_thread_1")?.lastOutboundAt).toBe(
      "2026-01-01T00:02:00.000Z",
    );
  });

  test("persists claimed incoming events across store restarts", () => {
    const bot = store.configure({ name: "Support bot" });

    expect(store.claimIncomingEvent(bot.id, "om_message_1", "2026-01-01T00:00:00.000Z")).toBe(true);

    const restartedStore = new LarkChannelStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    expect(
      restartedStore.claimIncomingEvent(bot.id, "om_message_1", "2026-01-01T00:01:00.000Z"),
    ).toBe(false);
    expect(
      restartedStore.claimIncomingEvent(bot.id, "om_message_2", "2026-01-01T00:01:00.000Z"),
    ).toBe(true);
  });

  test("allows a claimed incoming event again after retention expires", () => {
    const bot = store.configure({ name: "Support bot" });

    expect(store.claimIncomingEvent(bot.id, "om_message_1", "2026-01-01T00:00:00.000Z")).toBe(true);
    expect(store.claimIncomingEvent(bot.id, "om_message_1", "2026-01-09T00:00:00.000Z")).toBe(true);
  });

  test("migrates version 3 stores with an empty processed event history", async () => {
    const filePath = store.getFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        version: 3,
        activeBotId: "bot-1",
        bots: [
          {
            id: "bot-1",
            name: "Support bot",
            config: {
              enabled: true,
              appId: "cli_test",
              appSecret: "secret",
              encryptKey: null,
              verificationToken: null,
              domain: "feishu",
              target: {
                kind: "workspace",
                provider: "claude",
                model: null,
                cwd: "/repo",
                workspaceId: null,
              },
            },
            authorizedUsers: [],
            pendingPairings: [],
            conversations: [],
          },
        ],
      }),
    );

    const migratedStore = new LarkChannelStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    expect(migratedStore.getPayload()).toMatchObject({
      version: 5,
      activeBotId: "bot-1",
      bots: [
        {
          id: "bot-1",
          processedEvents: [],
          config: {
            substitute: {
              enabled: false,
              openId: null,
              name: null,
            },
          },
        },
      ],
    });
    expect(
      migratedStore.claimIncomingEvent("bot-1", "om_message_1", "2026-01-01T00:00:00.000Z"),
    ).toBe(true);
  });

  test("migrates version 4 stores without losing processed event history", async () => {
    const filePath = store.getFilePath();
    await mkdir(path.dirname(filePath), { recursive: true });
    await writeFile(
      filePath,
      JSON.stringify({
        version: 4,
        activeBotId: "bot-1",
        bots: [
          {
            id: "bot-1",
            name: "Support bot",
            config: {
              enabled: true,
              appId: "cli_test",
              appSecret: "secret",
              encryptKey: null,
              verificationToken: null,
              domain: "feishu",
              target: {
                kind: "workspace",
                provider: "claude",
                model: null,
                cwd: "/repo",
                workspaceId: null,
              },
            },
            authorizedUsers: [],
            pendingPairings: [],
            conversations: [],
            processedEvents: [
              {
                key: "om_message_1",
                processedAt: "2026-01-01T00:00:00.000Z",
              },
            ],
          },
        ],
      }),
    );

    const migratedStore = new LarkChannelStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    expect(migratedStore.getPayload()).toMatchObject({
      version: 5,
      bots: [
        {
          config: {
            substitute: {
              enabled: false,
              openId: null,
              name: null,
            },
          },
          processedEvents: [
            {
              key: "om_message_1",
              processedAt: "2026-01-01T00:00:00.000Z",
            },
          ],
        },
      ],
    });
  });

  test("stores multiple bot configurations independently", () => {
    const first = store.configure({
      createNew: true,
      name: "Settlement bot",
      appId: "cli_settle",
      appSecret: "secret-1",
    });
    const second = store.configure({
      createNew: true,
      name: "Ops bot",
      appId: "cli_ops",
      appSecret: "secret-2",
    });

    expect(first.id).not.toBe(second.id);
    expect(store.getStatus().activeBotId).toBe(second.id);
    expect(store.getStatus().bots.map((bot) => bot.appId)).toEqual(["cli_settle", "cli_ops"]);

    store.configure({ botId: first.id, name: "Settlement bot v2", appId: "cli_settle_v2" });
    const status = store.getStatus();
    expect(status.activeBotId).toBe(first.id);
    expect(status.bots.find((bot) => bot.id === first.id)).toMatchObject({
      name: "Settlement bot v2",
      appId: "cli_settle_v2",
      hasAppSecret: true,
    });
    expect(status.bots.find((bot) => bot.id === second.id)).toMatchObject({
      name: "Ops bot",
      appId: "cli_ops",
    });

    expect(store.deleteBot(first.id)).toBe(true);
    expect(store.getStatus().bots.map((bot) => bot.id)).toEqual([second.id]);
  });
});
