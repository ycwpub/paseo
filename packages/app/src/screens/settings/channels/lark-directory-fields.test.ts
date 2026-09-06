import { describe, expect, test } from "vitest";
import {
  findLarkDirectoryChat,
  findLarkDirectoryUser,
  formatLarkChatLabel,
  formatLarkChatId,
  formatLarkUserIdentity,
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
  groupId: "7160881741501267996",
  chatId: "oc_settlement",
  name: "结算群",
  updatedAt: "2026-08-19T00:00:00.000Z",
};

describe("Lark directory labels", () => {
  test("formats user and group labels with every stable identity", () => {
    expect(formatLarkUserLabel(user)).toBe("Alice（alice@example.com，ou_alice）");
    expect(
      formatLarkUserLabel({
        ...user,
        displayName: "张三",
        email: "zhangsan@example.com",
      }),
    ).toBe("张三（zhangsan@example.com，ou_alice）");
    expect(formatLarkChatLabel(chat)).toBe("结算群（7160881741501267996、oc_settlement）");
  });

  test("falls back to available identity fields without dropping the Open ID", () => {
    expect(
      formatLarkUserLabel({
        ...user,
        email: null,
        displayName: "Lark user",
      }),
    ).toBe("ou_alice");
    expect(
      formatLarkUserLabel({
        ...user,
        displayName: null,
      }),
    ).toBe("alice@example.com（ou_alice）");
    expect(
      formatLarkUserLabel({
        ...user,
        email: null,
        displayName: null,
      }),
    ).toBe("ou_alice");
    expect(formatLarkUserOpenId([], "cli_test", "ou_alice", "张三")).toBe("张三（ou_alice）");
    expect(
      formatLarkUserIdentity({
        displayName: "张三",
        email: "zhangsan@example.com",
        openId: "ou_alice",
      }),
    ).toBe("张三（zhangsan@example.com，ou_alice）");
  });

  test("falls back to raw IDs and avoids repeating an identical group ID", () => {
    expect(formatLarkUserOpenId([], "cli_test", "ou_unknown")).toBe("ou_unknown");
    expect(formatLarkChatId([], "cli_test", "oc_unknown")).toBe("oc_unknown");
    expect(
      formatLarkChatLabel({
        ...chat,
        groupId: "oc_settlement",
      }),
    ).toBe("结算群（oc_settlement）");
    expect(
      formatLarkChatLabel({
        ...chat,
        groupId: "oc_settlement",
        name: "结算群（7160881741501267996）",
      }),
    ).toBe("结算群（7160881741501267996、oc_settlement）");
  });

  test("scopes relation lookup by bot App ID", () => {
    expect(findLarkDirectoryUser([user], "cli_test", "ou_alice")).toEqual(user);
    expect(findLarkDirectoryUser([user], "cli_other", "ou_alice")).toBeNull();
    expect(findLarkDirectoryChat([chat], "cli_test", "oc_settlement")).toEqual(chat);
    expect(findLarkDirectoryChat([chat], "cli_other", "oc_settlement")).toBeNull();
  });
});
