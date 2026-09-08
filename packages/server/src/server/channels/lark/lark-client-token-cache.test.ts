import { describe, expect, it } from "vitest";
import { invalidateLarkClientTokens, larkClientTokenCache } from "./lark-client-token-cache.js";

describe("larkClientTokenCache", () => {
  it("invalidates only the updated application's cached tokens", async () => {
    const tokenKey = Symbol("tenant-access-token");
    await larkClientTokenCache.set(tokenKey, "old-token", undefined, {
      namespace: "cli_updated",
    });
    await larkClientTokenCache.set(tokenKey, "other-token", undefined, {
      namespace: "cli_other",
    });

    invalidateLarkClientTokens("cli_updated");

    await expect(
      larkClientTokenCache.get(tokenKey, { namespace: "cli_updated" }),
    ).resolves.toBeUndefined();
    await expect(larkClientTokenCache.get(tokenKey, { namespace: "cli_other" })).resolves.toBe(
      "other-token",
    );
  });

  it("does not return expired values", async () => {
    const tokenKey = Symbol("expired-token");
    await larkClientTokenCache.set(tokenKey, "expired", Date.now() - 1, {
      namespace: "cli_expired",
    });

    await expect(
      larkClientTokenCache.get(tokenKey, { namespace: "cli_expired" }),
    ).resolves.toBeUndefined();
  });
});
