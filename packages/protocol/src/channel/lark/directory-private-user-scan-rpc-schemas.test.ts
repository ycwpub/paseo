import { describe, expect, test } from "vitest";
import {
  LarkDirectoryAddPrivateUserRequestSchema,
  LarkDirectoryScanPrivateUsersRequestSchema,
  LarkDirectoryScanPrivateUsersResponseSchema,
} from "./directory-private-user-scan-rpc-schemas.js";

describe("Lark directory private-user scan RPC schemas", () => {
  test("accepts a bounded scan range and recent private-user results", () => {
    expect(
      LarkDirectoryScanPrivateUsersRequestSchema.parse({
        type: "channel.lark.directory.scan_private_users.request",
        requestId: "scan-1",
        appId: "cli_test",
        lookbackMinutes: 30,
      }).lookbackMinutes,
    ).toBe(30);

    expect(
      LarkDirectoryScanPrivateUsersResponseSchema.parse({
        type: "channel.lark.directory.scan_private_users.response",
        payload: {
          requestId: "scan-1",
          users: [
            {
              appId: "cli_test",
              openId: "ou_alice",
              displayName: "张三",
              firstMessageContent: "你好",
              firstMessageAt: "2026-09-07T08:00:00.000Z",
              lastMessageContent: "请看一下",
              lastMessageAt: "2026-09-07T08:10:00.000Z",
              messageCount: 2,
              inDirectory: false,
            },
          ],
          error: null,
        },
      }).payload.users,
    ).toHaveLength(1);
  });

  test("accepts an explicit message time range and rejects invalid ranges", () => {
    expect(
      LarkDirectoryScanPrivateUsersRequestSchema.parse({
        type: "channel.lark.directory.scan_private_users.request",
        requestId: "scan-explicit",
        appId: "cli_test",
        lookbackMinutes: 30,
        startTime: 1_788_729_600,
        endTime: 1_788_733_200,
      }),
    ).toMatchObject({
      startTime: 1_788_729_600,
      endTime: 1_788_733_200,
    });

    expect(
      LarkDirectoryScanPrivateUsersRequestSchema.safeParse({
        type: "channel.lark.directory.scan_private_users.request",
        requestId: "scan-partial",
        appId: "cli_test",
        lookbackMinutes: 30,
        startTime: 1_788_729_600,
      }).success,
    ).toBe(false);
    expect(
      LarkDirectoryScanPrivateUsersRequestSchema.safeParse({
        type: "channel.lark.directory.scan_private_users.request",
        requestId: "scan-reversed",
        appId: "cli_test",
        lookbackMinutes: 30,
        startTime: 1_788_733_200,
        endTime: 1_788_729_600,
      }).success,
    ).toBe(false);
  });

  test("accepts adding a scanned private user to the directory", () => {
    expect(
      LarkDirectoryAddPrivateUserRequestSchema.parse({
        type: "channel.lark.directory.add_private_user.request",
        requestId: "add-1",
        appId: "cli_test",
        openId: "ou_alice",
        displayName: "张三",
        firstMessageContent: "你好",
        firstMessageAt: "2026-09-07T08:00:00.000Z",
      }).openId,
    ).toBe("ou_alice");
  });
});
