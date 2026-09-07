import { describe, expect, test, vi } from "vitest";
import {
  describeLarkApiError,
  mapLarkRequestsWithConcurrency,
  parseLarkRateLimitReset,
  withLarkRateLimitRetry,
} from "./lark-api-request.js";

function rateLimitError(reset = "2") {
  return {
    response: {
      data: {
        code: 99991400,
        msg: "request trigger frequency limit",
        log_id: "log-1",
      },
      headers: {
        "x-ogw-ratelimit-reset": reset,
        authorization: "Bearer secret-user-token",
      },
    },
  };
}

describe("Lark API request controls", () => {
  test("extracts rate-limit details without retaining the original token-bearing error", () => {
    const error = describeLarkApiError(rateLimitError());

    expect(error).toMatchObject({
      code: 99991400,
      logId: "log-1",
      retryAfterMs: 2_000,
    });
    expect(error.message).toContain("request trigger frequency limit");
    expect(error.cause).toBeUndefined();
    expect(JSON.stringify(error)).not.toContain("secret-user-token");
  });

  test("redacts bearer tokens embedded in provider error messages", () => {
    const error = describeLarkApiError(
      new Error("request failed with Authorization: Bearer secret-user-token"),
    );

    expect(error.message).toContain("Bearer [redacted]");
    expect(error.message).not.toContain("secret-user-token");
  });

  test("parses relative and epoch reset headers", () => {
    expect(parseLarkRateLimitReset({ "X-Ogw-Ratelimit-Reset": "3" }, 1_000)).toBe(3_000);
    expect(
      parseLarkRateLimitReset({ "x-ogw-ratelimit-reset": "2000000000" }, 1_999_999_999_000),
    ).toBe(1_000);
  });

  test("waits for the provider reset before retrying a rate-limited request", async () => {
    const operation = vi.fn().mockRejectedValueOnce(rateLimitError("4")).mockResolvedValue("ok");
    const sleep = vi.fn(async () => undefined);

    await expect(withLarkRateLimitRetry(operation, { sleep })).resolves.toBe("ok");
    expect(sleep).toHaveBeenCalledWith(4_000);
    expect(operation).toHaveBeenCalledTimes(2);
  });

  test("limits detail request concurrency and keeps successful items", async () => {
    let active = 0;
    let maximumActive = 0;
    const result = await mapLarkRequestsWithConcurrency([1, 2, 3, 4, 5], 2, async (value) => {
      active += 1;
      maximumActive = Math.max(maximumActive, active);
      await Promise.resolve();
      active -= 1;
      if (value === 3) throw new Error("single item failed");
      return value * 2;
    });

    expect(maximumActive).toBe(2);
    expect(result.values.sort((left, right) => left - right)).toEqual([2, 4, 8, 10]);
    expect(result.errors).toHaveLength(1);
  });
});
