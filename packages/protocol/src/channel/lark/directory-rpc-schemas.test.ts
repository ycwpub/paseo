import { describe, expect, test } from "vitest";
import {
  LarkDirectoryResolveChatsRequestSchema,
  LarkDirectoryResolveUsersRequestSchema,
} from "./directory-rpc-schemas.js";

describe("Lark directory RPC schemas", () => {
  test("normalizes user lookup input", () => {
    expect(
      LarkDirectoryResolveUsersRequestSchema.parse({
        type: "channel.lark.directory.resolve_users.request",
        requestId: "request-1",
        appId: " cli_test ",
        emails: [" alice@example.com "],
      }),
    ).toMatchObject({
      appId: "cli_test",
      emails: ["alice@example.com"],
    });
  });

  test("requires a group name or ID", () => {
    expect(() =>
      LarkDirectoryResolveChatsRequestSchema.parse({
        type: "channel.lark.directory.resolve_chats.request",
        requestId: "request-1",
        appId: "cli_test",
        query: " ",
      }),
    ).toThrow();
  });
});
