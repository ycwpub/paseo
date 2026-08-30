import { describe, expect, it } from "vitest";
import { shouldClearDesktopAttention } from "./use-clear-attention-when-read";

describe("shouldClearDesktopAttention", () => {
  it("clears attention only when the final unread workspace becomes read", () => {
    expect(shouldClearDesktopAttention(2, undefined)).toBe(true);
    expect(shouldClearDesktopAttention(2, 1)).toBe(false);
    expect(shouldClearDesktopAttention(undefined, undefined)).toBe(false);
  });
});
