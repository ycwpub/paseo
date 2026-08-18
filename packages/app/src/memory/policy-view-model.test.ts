import { describe, expect, test } from "vitest";
import type { PaseoMemoryState } from "@getpaseo/protocol/messages";
import { memoryScopePolicyDraft } from "./policy-view-model";

function memory(overrides: Partial<PaseoMemoryState>): PaseoMemoryState {
  return {
    settings: {
      enabled: true,
      autoExtract: true,
      maxInjectedChars: 8_000,
      maxRetrievedDetails: 3,
    },
    summary: "",
    summaryPath: "/tmp/summary.md",
    details: [],
    stats: {
      detailCount: 0,
      pendingExtractions: 0,
      lastExtractedAt: null,
      lastExtractionError: null,
    },
    ...overrides,
  };
}

describe("memory scope policy draft", () => {
  test("reads a saved scope policy", () => {
    expect(
      memoryScopePolicyDraft(
        memory({
          scopePolicies: [
            {
              scope: { type: "assistant", id: "assistant-1" },
              enabled: false,
              extractionInstructions: "Only final reusable procedures.",
            },
          ],
        }),
        { type: "assistant", id: "assistant-1" },
      ),
    ).toEqual({
      enabled: false,
      extractionInstructions: "Only final reusable procedures.",
    });
  });

  test("uses a legacy Project policy until the scope policy is saved", () => {
    expect(
      memoryScopePolicyDraft(
        memory({
          policies: [
            {
              target: { type: "project", id: "project-1" },
              enabled: false,
              extractionInstructions: "Architecture decisions only.",
            },
          ],
        }),
        { type: "project", id: "project-1" },
      ),
    ).toEqual({
      enabled: false,
      extractionInstructions: "Architecture decisions only.",
    });
  });

  test("keeps global policies isolated by memory user", () => {
    const state = memory({
      scopePolicies: [
        {
          scope: { type: "global", id: "user-1" },
          enabled: false,
          extractionInstructions: "User one only.",
        },
        {
          scope: { type: "global", id: "user-2" },
          enabled: true,
          extractionInstructions: "User two only.",
        },
      ],
    });
    expect(memoryScopePolicyDraft(state, { type: "global", id: "user-1" })).toEqual({
      enabled: false,
      extractionInstructions: "User one only.",
    });
    expect(memoryScopePolicyDraft(state, { type: "global", id: "user-2" })).toEqual({
      enabled: true,
      extractionInstructions: "User two only.",
    });
  });
});
