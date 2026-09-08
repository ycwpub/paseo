import { describe, expect, test } from "vitest";
import {
  isLarkBotPermissionRequiredError,
  isLarkUserOAuthRequiredError,
} from "./lark-permission-error";

describe("Lark permission error actions", () => {
  test("distinguishes user OAuth failures from bot permission failures", () => {
    expect(
      isLarkUserOAuthRequiredError(
        "飞书用户身份权限不足，请重新完成 OAuth 授权（缺少 wiki:wiki:readonly）",
      ),
    ).toBe(true);
    expect(
      isLarkBotPermissionRequiredError(
        "飞书用户身份权限不足，请重新完成 OAuth 授权（缺少 wiki:wiki:readonly）",
      ),
    ).toBe(false);

    expect(
      isLarkBotPermissionRequiredError(
        "飞书机器人应用身份权限不足，请更新机器人权限（缺少 base:record:create；code: 99991679）",
      ),
    ).toBe(true);
    expect(
      isLarkUserOAuthRequiredError(
        "飞书机器人应用身份权限不足，请更新机器人权限（缺少 base:record:create；code: 99991679）",
      ),
    ).toBe(false);
  });

  test("does not offer OAuth again for a Wiki resource visibility failure", () => {
    expect(
      isLarkUserOAuthRequiredError(
        "当前授权用户无法读取归因记录根目录，请确认该目录对授权用户可见且 OAuth 已包含 wiki:wiki:readonly（code: 131006）",
      ),
    ).toBe(false);
  });
});
