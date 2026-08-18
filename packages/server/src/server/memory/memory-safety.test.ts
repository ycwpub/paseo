import { describe, expect, test } from "vitest";
import {
  containsSensitivePersonalData,
  isSafeMemoryContent,
  redactMemorySecrets,
} from "./memory-safety.js";

describe("isSafeMemoryContent", () => {
  test("rejects common credential shapes without blocking ordinary preferences", () => {
    expect(isSafeMemoryContent("Prefer concise Chinese answers.")).toBe(true);
    expect(isSafeMemoryContent("api_key=top-secret-value")).toBe(false);
    expect(isSafeMemoryContent("Authorization: Bearer abcdefghijklmnop")).toBe(false);
    expect(isSafeMemoryContent("-----BEGIN PRIVATE KEY-----")).toBe(false);
  });

  test("detects sensitive personal data separately from secrets", () => {
    expect(containsSensitivePersonalData("The user discussed a medical diagnosis.")).toBe(true);
    expect(containsSensitivePersonalData("Prefer concise answers.")).toBe(false);
  });

  test("redacts detected secrets before content can be persisted", () => {
    expect(redactMemorySecrets("Use api_key=top-secret-value for the request.")).toBe(
      "Use [REDACTED] for the request.",
    );
  });
});
