import { describe, expect, it } from "vitest";

import type { StreamItem } from "@/types/stream";
import { hasActiveContextCompaction } from "./compaction-state";

function compaction(status: "loading" | "completed"): StreamItem {
  return {
    kind: "compaction",
    id: `compaction-${status}`,
    timestamp: new Date(0),
    status,
    trigger: "auto",
  };
}

describe("hasActiveContextCompaction", () => {
  it("finds an active compaction in either timeline segment", () => {
    expect(hasActiveContextCompaction([], [compaction("loading")])).toBe(true);
  });

  it("returns false after compaction completes", () => {
    expect(hasActiveContextCompaction([compaction("completed")], [])).toBe(false);
  });
});
