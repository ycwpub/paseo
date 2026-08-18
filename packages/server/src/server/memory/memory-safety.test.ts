import { describe, expect, test } from "vitest";
import { isSafeMemoryContent } from "./memory-safety.js";

describe("isSafeMemoryContent", () => {
  test("rejects common credential shapes without blocking ordinary preferences", () => {
    expect(isSafeMemoryContent("Prefer concise Chinese answers.")).toBe(true);
    expect(isSafeMemoryContent("api_key=top-secret-value")).toBe(false);
    expect(isSafeMemoryContent("Authorization: Bearer abcdefghijklmnop")).toBe(false);
    expect(isSafeMemoryContent("-----BEGIN PRIVATE KEY-----")).toBe(false);
  });
});
