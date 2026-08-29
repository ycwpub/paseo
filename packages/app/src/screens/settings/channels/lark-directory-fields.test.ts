import { describe, expect, test } from "vitest";
import {
  findLarkDirectoryChat,
  findLarkDirectoryUser,
  formatLarkChatLabel,
  formatLarkUserLabel,
  formatLarkUserOpenId,
} from "./lark-directory-format";

const user = {
  appId: "cli_test",
  email: "alice@example.com",
  openId: "ou_alice",
  displayName: "Alice",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

const chat = {
  appId: "cli_test",
  groupId: "group_settlement",
  chatId: "oc_settlement",
  name: "结算群",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

describe("Lark directory labels", () => {
  test("formats friendly user and group labels", () => {
    expect(formatLarkUserLabel(user)).toBe("Alice（alice@example.com）");
    expect(
      formatLarkUserLabel({
        ...user,
        displayName: "张三",
        email: "zhangsan@example.com",
      }),
    ).toBe("张三（zhangsan@example.com）");
    expect(formatLarkChatLabel(chat)).toBe("结算群（group_settlement）");
  });

  test("falls back to the available friendly user identity", () => {
    expect(
      formatLarkUserLabel({
        ...user,
        email: null,
        displayName: "Lark user",
      }),
    ).toBe("Lark user");
    expect(
      formatLarkUserLabel({
        ...user,
        displayName: null,
      }),
    ).toBe("alice@example.com");
    expect(
      formatLarkUserLabel({
        ...user,
        email: null,
        displayName: null,
      }),
    ).toBe("ou_alice");
    expect(formatLarkUserOpenId([], "cli_test", "ou_alice", "张三")).toBe("张三");
  });

  test("scopes relation lookup by bot App ID", () => {
    expect(findLarkDirectoryUser([user], "cli_test", "ou_alice")).toEqual(user);
    expect(findLarkDirectoryUser([user], "cli_other", "ou_alice")).toBeNull();
    expect(findLarkDirectoryChat([chat], "cli_test", "oc_settlement")).toEqual(chat);
    expect(findLarkDirectoryChat([chat], "cli_other", "oc_settlement")).toBeNull();
  });
});
