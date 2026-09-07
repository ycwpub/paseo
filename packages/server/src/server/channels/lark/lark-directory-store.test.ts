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
        firstMessageContent: null,
        firstMessageAt: null,
        updatedAt: "2026-08-19T01:00:00.000Z",
      },
      {
        appId: "cli_two",
        email: "alice@example.com",
        openId: "ou_other",
        displayName: "Other Alice",
        firstMessageContent: null,
        firstMessageAt: null,
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

  test("persists a visible user even when the email field is unavailable", () => {
    const [user] = store.upsertResolvedUsers(
      "cli_test",
      [{ email: null, openId: "ou_visible", displayName: "袁昌旺" }],
      "2026-09-07T08:00:00.000Z",
    );

    expect(user).toMatchObject({
      appId: "cli_test",
      email: null,
      openId: "ou_visible",
      displayName: "袁昌旺",
    });
    expect(store.findUser("cli_test", "ou_visible")).toMatchObject({
      email: null,
      displayName: "袁昌旺",
    });
  });

  test("preserves a previously stored email when a later lookup cannot read it", () => {
    store.upsertResolvedUsers(
      "cli_test",
      [{ email: "yuan@example.com", openId: "ou_yuan", displayName: "旧名称" }],
      "2026-09-07T08:00:00.000Z",
    );

    store.upsertResolvedUsers(
      "cli_test",
      [{ email: null, openId: "ou_yuan", displayName: "袁昌旺" }],
      "2026-09-07T08:01:00.000Z",
    );

    expect(store.findUser("cli_test", "ou_yuan")).toMatchObject({
      email: "yuan@example.com",
      displayName: "袁昌旺",
    });
  });

  test("observed generic names do not overwrite a real user name", () => {
    store.upsertResolvedUsers(
      "cli_test",
      [{ email: "alice@example.com", openId: "ou_alice", displayName: "张三" }],
      "2026-08-19T03:00:00.000Z",
    );

    store.observeUser(
      "cli_test",
      { openId: "ou_alice", displayName: "Lark user" },
      "2026-08-19T03:01:00.000Z",
    );

    expect(store.findUser("cli_test", "ou_alice")).toMatchObject({
      email: "alice@example.com",
      displayName: "张三",
    });
  });

  test("keeps the first observed message when later messages arrive", () => {
    store.observeUser(
      "cli_test",
      {
        openId: "ou_alice",
        displayName: "Alice",
        firstMessageContent: "第一条消息",
        firstMessageAt: "2026-09-06T01:00:00.000Z",
      },
      "2026-09-06T01:00:01.000Z",
    );
    store.observeUser(
      "cli_test",
      {
        openId: "ou_alice",
        displayName: "Alice",
        firstMessageContent: "后续消息",
        firstMessageAt: "2026-09-06T02:00:00.000Z",
      },
      "2026-09-06T02:00:01.000Z",
    );

    expect(store.findUser("cli_test", "ou_alice")).toMatchObject({
      firstMessageContent: "第一条消息",
      firstMessageAt: "2026-09-06T01:00:00.000Z",
    });
  });

  test("manually updates identity fields without changing the first message", () => {
    store.observeUser(
      "cli_test",
      {
        openId: "ou_alice",
        firstMessageContent: "请帮忙确认订单",
        firstMessageAt: "2026-09-06T01:00:00.000Z",
      },
      "2026-09-06T01:00:01.000Z",
    );

    expect(
      store.updateUser(
        "cli_test",
        "ou_alice",
        { displayName: "张三", email: "Alice@Example.com" },
        "2026-09-06T03:00:00.000Z",
      ),
    ).toMatchObject({
      displayName: "张三",
      email: "alice@example.com",
      firstMessageContent: "请帮忙确认订单",
      firstMessageAt: "2026-09-06T01:00:00.000Z",
    });
  });

  test("creates a manual contact and rejects a duplicate for the same bot", () => {
    expect(
      store.createUser(
        "cli_test",
        " ou_alice ",
        { displayName: " 张三 ", email: "Alice@Example.com" },
        "2026-09-07T03:00:00.000Z",
      ),
    ).toEqual({
      appId: "cli_test",
      openId: "ou_alice",
      displayName: "张三",
      email: "alice@example.com",
      firstMessageContent: null,
      firstMessageAt: null,
      updatedAt: "2026-09-07T03:00:00.000Z",
    });

    expect(() =>
      store.createUser(
        "cli_test",
        "ou_alice",
        { displayName: null, email: null },
        "2026-09-07T03:01:00.000Z",
      ),
    ).toThrow("联系人已存在：ou_alice");
  });

  test("deletes only selected contacts belonging to one bot", () => {
    store.createUser(
      "cli_test",
      "ou_alice",
      { displayName: "张三", email: null },
      "2026-09-07T03:00:00.000Z",
    );
    store.createUser(
      "cli_test",
      "ou_bob",
      { displayName: "李四", email: null },
      "2026-09-07T03:01:00.000Z",
    );
    store.createUser(
      "cli_other",
      "ou_alice",
      { displayName: "其他机器人联系人", email: null },
      "2026-09-07T03:02:00.000Z",
    );

    expect(store.deleteUsers("cli_test", ["ou_alice", "ou_missing"])).toEqual(["ou_alice"]);
    expect(store.findUser("cli_test", "ou_alice")).toBeNull();
    expect(store.findUser("cli_test", "ou_bob")).not.toBeNull();
    expect(store.findUser("cli_other", "ou_alice")).not.toBeNull();
  });

  test("clears first message content only for contacts belonging to the selected bot", () => {
    store.observeUser(
      "cli_test",
      {
        openId: "ou_alice",
        firstMessageContent: "需要清理",
        firstMessageAt: "2026-09-06T01:00:00.000Z",
      },
      "2026-09-06T01:00:01.000Z",
    );
    store.observeUser(
      "cli_other",
      {
        openId: "ou_bob",
        firstMessageContent: "其他机器人消息",
        firstMessageAt: "2026-09-06T02:00:00.000Z",
      },
      "2026-09-06T02:00:01.000Z",
    );

    expect(store.clearFirstMessageContents("cli_test", "2026-09-07T00:00:00.000Z")).toBe(1);
    expect(store.findUser("cli_test", "ou_alice")).toMatchObject({
      firstMessageContent: null,
      firstMessageAt: "2026-09-06T01:00:00.000Z",
      updatedAt: "2026-09-07T00:00:00.000Z",
    });
    expect(store.findUser("cli_other", "ou_bob")).toMatchObject({
      firstMessageContent: "其他机器人消息",
      firstMessageAt: "2026-09-06T02:00:00.000Z",
    });
  });

  test("extracts a numeric group ID from a group name when Lark only returns chat_id", () => {
    store.upsertChats(
      "cli_test",
      [
        {
          groupId: "oc_settlement",
          chatId: "oc_settlement",
          name: "结算电话报警群(7160881741501267996)",
        },
      ],
      "2026-08-19T03:00:00.000Z",
    );

    expect(store.findChat("cli_test", "oc_settlement")).toMatchObject({
      groupId: "7160881741501267996",
      chatId: "oc_settlement",
      name: "结算电话报警群(7160881741501267996)",
    });
  });

  test("does not overwrite a real group ID with chat_id during refresh", () => {
    store.upsertChats(
      "cli_test",
      [
        {
          groupId: "7160881741501267996",
          chatId: "oc_settlement",
          name: "结算研发群",
        },
      ],
      "2026-09-06T03:00:00.000Z",
    );
    store.upsertChats(
      "cli_test",
      [
        {
          groupId: "oc_settlement",
          chatId: "oc_settlement",
          name: "结算研发群",
        },
      ],
      "2026-09-06T03:01:00.000Z",
    );

    expect(store.findChat("cli_test", "oc_settlement")).toMatchObject({
      groupId: "7160881741501267996",
      chatId: "oc_settlement",
      name: "结算研发群",
    });
  });
});
