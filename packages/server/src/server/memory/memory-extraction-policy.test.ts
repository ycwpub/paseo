import { describe, expect, test } from "vitest";
import { DEFAULT_MEMORY_SETTINGS } from "./memory-model.js";
import { evaluateMemoryExtractionCandidate } from "./memory-extraction-policy.js";

describe("memory extraction policy", () => {
  test("accepts durable high-confidence information", () => {
    expect(
      evaluateMemoryExtractionCandidate({
        candidate: {
          content: "The user prefers concise Chinese answers.",
          confidence: 0.9,
        },
        explicit: false,
        settings: DEFAULT_MEMORY_SETTINGS,
      }),
    ).toEqual({
      accepted: true,
      content: "The user prefers concise Chinese answers.",
      sensitive: false,
    });
  });

  test("rejects low-confidence, secret, and transient automatic memory", () => {
    expect(
      evaluateMemoryExtractionCandidate({
        candidate: { content: "The user may prefer dark mode.", confidence: 0.4 },
        explicit: false,
        settings: DEFAULT_MEMORY_SETTINGS,
      }),
    ).toEqual({ accepted: false, reason: "low-confidence" });
    expect(
      evaluateMemoryExtractionCandidate({
        candidate: { content: "api_key=top-secret-value", confidence: 1 },
        explicit: true,
        settings: DEFAULT_MEMORY_SETTINGS,
      }),
    ).toEqual({ accepted: false, reason: "secret" });
    expect(
      evaluateMemoryExtractionCandidate({
        candidate: { content: "The build failed temporarily with exit code 1.", confidence: 0.9 },
        explicit: false,
        settings: DEFAULT_MEMORY_SETTINGS,
      }),
    ).toEqual({ accepted: false, reason: "transient" });
  });

  test("requires an explicit request for sensitive memory under manual-only policy", () => {
    const settings = {
      ...DEFAULT_MEMORY_SETTINGS,
      sensitiveMemoryPolicy: "manual-only" as const,
    };
    const candidate = {
      content: "The user discussed a medical diagnosis.",
      confidence: 0.95,
    };
    expect(evaluateMemoryExtractionCandidate({ candidate, explicit: false, settings })).toEqual({
      accepted: false,
      reason: "sensitive",
    });
    expect(evaluateMemoryExtractionCandidate({ candidate, explicit: true, settings })).toEqual({
      accepted: true,
      content: candidate.content,
      sensitive: true,
    });
  });
});
