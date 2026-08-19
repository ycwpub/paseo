import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";
import pino from "pino";
import { afterEach, beforeEach, describe, expect, test } from "vitest";
import { LarkDirectoryStore } from "./lark-directory-store.js";

describe("LarkDirectoryStore", () => {
  let paseoHome: string;
  let store: LarkDirectoryStore;

  beforeEach(async () => {
    paseoHome = await mkdtemp(path.join(tmpdir(), "paseo-lark-directory-"));
    store = new LarkDirectoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
  });

  afterEach(async () => {
    await rm(paseoHome, { recursive: true, force: true });
  });

  test("persists user relations and isolates them by App ID", () => {
    store.upsertResolvedUsers(
      "cli_one",
      [{ email: "Alice@Example.com", openId: "ou_alice", displayName: "Alice" }],
      "2026-08-19T01:00:00.000Z",
    );
    store.upsertResolvedUsers(
      "cli_two",
      [{ email: "alice@example.com", openId: "ou_other", displayName: "Other Alice" }],
      "2026-08-19T01:01:00.000Z",
    );

    expect(store.getState().users).toEqual([
      {
        appId: "cli_one",
        email: "alice@example.com",
        openId: "ou_alice",
        displayName: "Alice",
        updatedAt: "2026-08-19T01:00:00.000Z",
      },
      {
        appId: "cli_two",
        email: "alice@example.com",
        openId: "ou_other",
        displayName: "Other Alice",
        updatedAt: "2026-08-19T01:01:00.000Z",
      },
    ]);
  });

  test("reloads persisted users and chats after restart", () => {
    store.upsertResolvedUsers(
      "cli_test",
      [{ email: "alice@example.com", openId: "ou_alice" }],
      "2026-08-19T02:00:00.000Z",
    );
    store.upsertChats(
      "cli_test",
      [{ groupId: "group-settlement", chatId: "oc_settlement", name: "结算群" }],
      "2026-08-19T02:01:00.000Z",
    );

    const reloaded = new LarkDirectoryStore({
      paseoHome,
      logger: pino({ level: "silent" }),
    });
    expect(reloaded.getState()).toMatchObject({
      users: [{ email: "alice@example.com", openId: "ou_alice" }],
      chats: [
        {
          groupId: "group-settlement",
          chatId: "oc_settlement",
          name: "结算群",
        },
      ],
    });
  });

  test("observed users preserve a previously resolved email", () => {
    store.upsertResolvedUsers(
      "cli_test",
      [{ email: "alice@example.com", openId: "ou_alice", displayName: "Alice" }],
      "2026-08-19T03:00:00.000Z",
    );

    store.observeUser(
      "cli_test",
      { openId: "ou_alice", displayName: "Alice Zhang" },
      "2026-08-19T03:01:00.000Z",
    );

    expect(store.findUser("cli_test", "ou_alice")).toMatchObject({
      email: "alice@example.com",
      displayName: "Alice Zhang",
    });
  });
});
