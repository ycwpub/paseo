import { describe, expect, it } from "vitest";
import { AIDEN_ACP_PROVIDER_CATALOG } from "@/data/aiden-acp-provider-catalog";
import { buildAcpProviderConfigPatch, getAcpProviderCatalog } from "./use-acp-provider-catalog";

function findProvider(id: string) {
  const entry = getAcpProviderCatalog().find((provider) => provider.id === id);
  if (!entry) {
    throw new Error(`Missing provider catalog entry: ${id}`);
  }
  return entry;
}

describe("Aiden ACP provider catalog", () => {
  it("adds Aiden providers without duplicating core provider ids", () => {
    const ids = getAcpProviderCatalog().map((entry) => entry.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids.slice(0, AIDEN_ACP_PROVIDER_CATALOG.length)).toEqual([
      "aiden-claude",
      "aiden-codex",
    ]);
  });

  it("maps Aiden providers to their built-in provider families", () => {
    expect(buildAcpProviderConfigPatch(findProvider("aiden-codex"))).toEqual({
      providers: {
        "aiden-codex": {
          extends: "codex",
          label: "Aiden Codex",
          description: "Codex provided through Aiden.",
          command: ["aiden", "x", "codex"],
          env: {},
        },
      },
    });
    expect(buildAcpProviderConfigPatch(findProvider("aiden-claude"))).toEqual({
      providers: {
        "aiden-claude": {
          extends: "claude",
          label: "Aiden Claude",
          description: "Claude provided through Aiden.",
          command: ["aiden", "x", "claude"],
          env: {},
        },
      },
    });
  });

  it("preserves core ACP provider launch configuration", () => {
    expect(buildAcpProviderConfigPatch(findProvider("amp-acp"))).toMatchObject({
      providers: {
        "amp-acp": {
          extends: "acp",
          command: ["amp-acp"],
        },
      },
    });
  });
});
