import { describe, expect, test } from "vitest";
import { resolveLarkDirectoryUserIdentity } from "./lark-directory-user-resolution.js";

describe("resolveLarkDirectoryUserIdentity", () => {
  test("keeps a visible user when the email field is unavailable", () => {
    expect(
      resolveLarkDirectoryUserIdentity({
        requestedOpenId: "ou_requested",
        user: {
          open_id: "ou_visible",
          name: "袁昌旺",
        },
      }),
    ).toEqual({
      email: null,
      openId: "ou_visible",
      displayName: "袁昌旺",
    });
  });

  test("returns null only when Lark did not return a user", () => {
    expect(
      resolveLarkDirectoryUserIdentity({
        requestedOpenId: "ou_missing",
        user: null,
      }),
    ).toBeNull();
  });
});
