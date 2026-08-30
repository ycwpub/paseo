import { describe, expect, it } from "vitest";
import { resolveProviderIconName } from "./provider-icon-name";
describe("resolveProviderIconName", () => {
    it("returns the catalog identifier for ACP catalog provider ids that ship an icon", () => {
        expect(resolveProviderIconName("aiden-claude")).toEqual({
            kind: "catalog",
            id: "aiden-claude",
        });
        expect(resolveProviderIconName("aiden-codex")).toEqual({
            kind: "catalog",
            id: "aiden-codex",
        });
        expect(resolveProviderIconName("amp-acp")).toEqual({ kind: "catalog", id: "amp-acp" });
        expect(resolveProviderIconName("gemini")).toEqual({ kind: "catalog", id: "gemini" });
        expect(resolveProviderIconName("traecli")).toEqual({ kind: "catalog", id: "traecli" });
    });
});
