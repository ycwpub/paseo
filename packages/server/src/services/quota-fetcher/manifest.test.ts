import { describe, expect, it } from "vitest";
import { PROVIDER_USAGE_FETCHERS } from "./manifest.js";

describe("provider usage manifest", () => {
  it("includes Aiden and TRAE CLI providers", () => {
    expect(PROVIDER_USAGE_FETCHERS.map((entry) => entry.providerId)).toEqual(
      expect.arrayContaining(["aiden-claude", "aiden-codex", "traecli"]),
    );
  });
});
