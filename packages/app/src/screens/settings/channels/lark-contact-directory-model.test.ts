import { describe, expect, test } from "vitest";
import type { LarkDirectoryUser } from "@getpaseo/protocol/messages";
import {
  isLarkContactEmailQuery,
  needsLarkContactResolution,
  normalizeLarkContactIdentityQuery,
  normalizeLarkContactOpenId,
} from "./lark-contact-directory-model";

function createUser(input: Partial<LarkDirectoryUser> = {}): LarkDirectoryUser {
  return {
    appId: "cli_test",
    openId: "ou_alice",
    displayName: "张三",
    email: "alice@example.com",
    firstMessageContent: null,
    firstMessageAt: null,
    updatedAt: "2026-09-07T00:00:00.000Z",
    ...input,
  };
}

describe("Lark contact directory model", () => {
  test("normalizes a valid ou_id", () => {
    expect(normalizeLarkContactOpenId(" ou_alice ")).toBe("ou_alice");
  });

  test("rejects an invalid ou_id", () => {
    expect(() => normalizeLarkContactOpenId("alice")).toThrow("请输入有效的 ou_id");
  });

  test("normalizes username or email lookup queries", () => {
    expect(normalizeLarkContactIdentityQuery(" 张三 ")).toBe("张三");
    expect(normalizeLarkContactIdentityQuery(" alice@example.com ")).toBe("alice@example.com");
    expect(() => normalizeLarkContactIdentityQuery("   ")).toThrow("请输入用户名或邮箱");
  });

  test("recognizes email queries that can be resolved through Lark", () => {
    expect(isLarkContactEmailQuery("alice@example.com")).toBe(true);
    expect(isLarkContactEmailQuery("张三")).toBe(false);
  });

  test("requests automatic resolution when either name or email is missing", () => {
    expect(needsLarkContactResolution(createUser())).toBe(false);
    expect(needsLarkContactResolution(createUser({ displayName: null }))).toBe(true);
    expect(needsLarkContactResolution(createUser({ email: null }))).toBe(true);
  });
});
