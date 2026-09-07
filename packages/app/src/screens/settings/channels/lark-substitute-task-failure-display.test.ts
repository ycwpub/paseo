import { describe, expect, test } from "vitest";
import { larkSubstituteFailureAdvice } from "./lark-substitute-task-failure-display";

describe("larkSubstituteFailureAdvice", () => {
  test("explains the relay-chat creation permission instead of suggesting message-read permission", () => {
    expect(
      larkSubstituteFailureAdvice(
        "private_scan",
        "飞书用户 OAuth 缺少 im:chat:create_by_user 权限，无法创建替身私聊转发群。",
      ),
    ).toBe(
      "请在飞书开发者后台开通用户身份的 im:chat:create_by_user 权限，点击下方“立即授权”重新授权后，再执行扫描。",
    );
  });
});
