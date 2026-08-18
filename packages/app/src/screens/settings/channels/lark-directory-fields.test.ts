import { describe, expect, test } from "vitest";
import {
  findLarkDirectoryChat,
  findLarkDirectoryUser,
  formatLarkChatLabel,
  formatLarkUserLabel,
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
    expect(formatLarkUserLabel(user)).toBe("ou_alice(alice@example.com)");
    expect(formatLarkChatLabel(chat)).toBe("oc_settlement(结算群、group_settlement)");
  });

  test("scopes relation lookup by bot App ID", () => {
    expect(findLarkDirectoryUser([user], "cli_test", "ou_alice")).toEqual(user);
    expect(findLarkDirectoryUser([user], "cli_other", "ou_alice")).toBeNull();
    expect(findLarkDirectoryChat([chat], "cli_test", "oc_settlement")).toEqual(chat);
    expect(findLarkDirectoryChat([chat], "cli_other", "oc_settlement")).toBeNull();
  });
});
