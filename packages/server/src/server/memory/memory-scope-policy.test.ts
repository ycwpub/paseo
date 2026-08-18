import { describe, expect, test } from "vitest";
import { resolveMemoryScopePolicies, upsertMemoryScopePolicies } from "./memory-scope-policy.js";

describe("memory scope policy", () => {
  test("filters disabled scopes and combines guidance from enabled scopes", () => {
    expect(
      resolveMemoryScopePolicies({
        availableScopes: [
          { type: "global" },
          { type: "project", id: "project-1" },
          { type: "workspace", id: "workspace-1" },
          { type: "assistant", id: "assistant-1" },
        ],
        policies: [
          {
            scope: { type: "global" },
            enabled: true,
            extractionInstructions: " Stable user preferences ",
          },
          {
            scope: { type: "project", id: "project-1" },
            enabled: false,
            extractionInstructions: "Do not use",
          },
          {
            scope: { type: "assistant", id: "assistant-1" },
            enabled: true,
            extractionInstructions: "Reusable assistant procedures",
          },
        ],
      }),
    ).toEqual({
      scopes: [
        { type: "global" },
        { type: "workspace", id: "workspace-1" },
        { type: "assistant", id: "assistant-1" },
      ],
      extractionInstructions: [
        "global: Stable user preferences",
        "assistant:assistant-1: Reusable assistant procedures",
      ],
    });
  });

  test("uses a legacy project policy until a scope policy is saved", () => {
    expect(
      resolveMemoryScopePolicies({
        availableScopes: [{ type: "project", id: "project-1" }],
        policies: [],
        legacyPolicies: [
          {
            target: { type: "project", id: "project-1" },
            enabled: false,
            extractionInstructions: "Legacy",
          },
        ],
      }),
    ).toEqual({ scopes: [], extractionInstructions: [] });
  });

  test("upserts by normalized scope and rejects missing scoped IDs", () => {
    expect(
      upsertMemoryScopePolicies(
        [
          {
            scope: { type: "workspace", id: "workspace-1" },
            enabled: true,
            extractionInstructions: "Old",
          },
        ],
        [
          {
            scope: { type: "workspace", id: " workspace-1 " },
            enabled: false,
            extractionInstructions: " New ",
          },
        ],
      ),
    ).toEqual([
      {
        scope: { type: "workspace", id: "workspace-1" },
        enabled: false,
        extractionInstructions: "New",
      },
    ]);
    expect(() =>
      upsertMemoryScopePolicies(
        [],
        [
          {
            scope: { type: "assistant" },
            enabled: true,
            extractionInstructions: "",
          },
        ],
      ),
    ).toThrow("assistant memory policy requires an ID");
  });
});
