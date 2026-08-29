import { mkdtempSync, readFileSync, rmSync, statSync } from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, expect, it } from "vitest";
import { LarkUserOAuthStore } from "./lark-user-oauth-store.js";

const roots: string[] = [];

afterEach(() => {
  for (const root of roots.splice(0)) {
    rmSync(root, { recursive: true, force: true });
  }
});

describe("LarkUserOAuthStore", () => {
  it("persists OAuth credentials in a private file", () => {
    const paseoHome = mkdtempSync(path.join(os.tmpdir(), "paseo-lark-oauth-store-"));
    roots.push(paseoHome);
    const store = new LarkUserOAuthStore({ paseoHome });
    store.set({
      appId: "cli_test",
      userAccessToken: "u-token",
      refreshToken: "r-token",
      expiresAt: "2026-08-29T04:00:00.000Z",
      refreshTokenExpiresAt: "2026-09-28T04:00:00.000Z",
      scope: "offline_access im:chat:read",
      openId: "ou_test",
      email: "test@example.com",
      displayName: "张三",
      authorizedAt: "2026-08-29T02:00:00.000Z",
      updatedAt: "2026-08-29T02:00:00.000Z",
    });

    const filePath = path.join(paseoHome, "channels", "lark-user-oauth.json");
    expect(statSync(filePath).mode & 0o777).toBe(0o600);
    expect(readFileSync(filePath, "utf8")).not.toContain("undefined");

    const reloaded = new LarkUserOAuthStore({ paseoHome });
    expect(reloaded.get("cli_test")).toMatchObject({
      userAccessToken: "u-token",
      refreshToken: "r-token",
      openId: "ou_test",
    });
  });
});
