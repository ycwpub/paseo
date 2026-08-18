import path from "node:path";
import { describe, expect, it } from "vitest";
import { bundledPluginMarketplaceCandidates } from "./bundled-plugin-marketplace.js";

describe("bundledPluginMarketplaceCandidates", () => {
  it("resolves the packaged plugin marketplace", () => {
    expect(
      bundledPluginMarketplaceCandidates("/Applications/Paseo.app/Contents/Resources"),
    ).toEqual([
      path.join(
        "/Applications/Paseo.app/Contents/Resources",
        ".agents",
        "plugins",
        "marketplace.json",
      ),
    ]);
  });

  it("returns no candidates outside a packaged desktop runtime", () => {
    expect(bundledPluginMarketplaceCandidates(undefined)).toEqual([]);
  });
});
