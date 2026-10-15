import { describe, expect, it } from "vitest";
import { resolveProviderIconName } from "./provider-icon-name";

describe("resolveProviderIconName", () => {
  it("uses the matching built-in icon for Aiden providers", () => {
    expect(resolveProviderIconName("aiden-claude")).toEqual({
      kind: "builtin",
      id: "claude",
    });
    expect(resolveProviderIconName("aiden-codex")).toEqual({
      kind: "builtin",
      id: "codex",
    });
  });

  it("returns the catalog identifier for ACP catalog provider ids that ship an icon", () => {
    expect(resolveProviderIconName("amp-acp")).toEqual({ kind: "catalog", id: "amp-acp" });
    expect(resolveProviderIconName("gemini")).toEqual({ kind: "catalog", id: "gemini" });
    expect(resolveProviderIconName("traecli")).toEqual({ kind: "catalog", id: "traecli" });
  });

  it("does not restore the removed Traex provider icon", () => {
    expect(resolveProviderIconName("traex")).toEqual({ kind: "bot" });
  });
});
