import { describe, expect, test, vi } from "vitest";
import { testableLarkAlertTroubleshooterApi } from "./lark-alert-troubleshooter-api.js";

describe("Lark alert troubleshooter API", () => {
  test("retries transient network failures with bounded exponential backoff", async () => {
    const operation = vi
      .fn()
      .mockRejectedValueOnce(new Error("connect ENETUNREACH 183.194.209.45:443"))
      .mockRejectedValueOnce(new Error("read ECONNRESET"))
      .mockResolvedValue({ code: 0, data: { ok: true } });
    const wait = vi.fn(async () => undefined);

    await expect(
      testableLarkAlertTroubleshooterApi.requestWithRetry(operation, { wait }),
    ).resolves.toEqual({ code: 0, data: { ok: true } });
    expect(operation).toHaveBeenCalledTimes(3);
    expect(wait).toHaveBeenNthCalledWith(1, 500);
    expect(wait).toHaveBeenNthCalledWith(2, 1_000);
  });

  test("reports a concise network error after the bounded retries", async () => {
    const operation = vi.fn(async () => {
      throw new Error("connect ENETUNREACH 183.194.209.45:443");
    });

    await expect(
      testableLarkAlertTroubleshooterApi.requestWithRetry(operation, {
        wait: async () => undefined,
      }),
    ).rejects.toThrow("飞书网络连接失败，已自动重试 3 次（ENETUNREACH）");
    expect(operation).toHaveBeenCalledTimes(3);
  });

  test("maps user-scope failures to an actionable OAuth error", async () => {
    await expect(
      testableLarkAlertTroubleshooterApi.requestWithRetry(
        async () => ({
          code: 99991679,
          msg: "Forbidden. required privileges",
        }),
        {
          context: {
            identity: "user",
            requiredScopes: ["wiki:wiki:readonly"],
          },
        },
      ),
    ).rejects.toThrow("飞书用户身份权限不足，请重新完成 OAuth 授权（缺少 wiki:wiki:readonly）");
  });

  test("maps bot-scope failures without mislabeling them as user OAuth failures", async () => {
    await expect(
      testableLarkAlertTroubleshooterApi.requestWithRetry(
        async () => ({
          code: 99991679,
          msg: "Forbidden. required privileges",
        }),
        {
          context: {
            identity: "bot",
            requiredScopes: ["base:record:create"],
          },
        },
      ),
    ).rejects.toThrow(
      "飞书机器人应用身份权限不足，请更新机器人权限（缺少 base:record:create；code: 99991679）",
    );
  });

  test("maps app-identity code 99991672 to the exact required scope", async () => {
    await expect(
      testableLarkAlertTroubleshooterApi.requestWithRetry(
        async () => ({
          code: 99991672,
          msg: "Forbidden. required privileges: wiki:wiki or wiki:node:create",
        }),
        {
          context: {
            identity: "bot",
            requiredScopes: ["wiki:node:create"],
          },
        },
      ),
    ).rejects.toThrow(
      "飞书机器人应用身份权限不足，请更新机器人权限（缺少 wiki:node:create；错误码 99991672）。请开通后重新执行任务。",
    );
  });

  test("does not retain tokens in surfaced errors", async () => {
    await expect(
      testableLarkAlertTroubleshooterApi.requestWithRetry(async () => {
        throw new Error("Authorization: Bearer secret-user-token");
      }),
    ).rejects.not.toThrow("secret-user-token");
  });
});
