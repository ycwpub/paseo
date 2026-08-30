import { describe, expect, it } from "vitest";
import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { hydrateStreamState } from "./stream";

function completedCompaction(timestamp: string): {
  event: AgentStreamEventPayload;
  timestamp: Date;
} {
  return {
    event: {
      type: "timeline",
      provider: "codex",
      item: { type: "compaction", status: "completed", trigger: "auto" },
    },
    timestamp: new Date(timestamp),
  };
}

describe("compaction timeline presentation", () => {
  it("coalesces adjacent completed markers emitted during recovery", () => {
    const state = hydrateStreamState([
      completedCompaction("2026-08-30T05:40:14.000Z"),
      completedCompaction("2026-08-30T05:40:15.000Z"),
    ]);

    expect(state.filter((item) => item.kind === "compaction")).toHaveLength(1);
  });

  it("keeps compactions separated by visible work", () => {
    const state = hydrateStreamState([
      completedCompaction("2026-08-30T05:40:14.000Z"),
      {
        event: {
          type: "timeline",
          provider: "codex",
          item: { type: "assistant_message", text: "继续处理任务。" },
        },
        timestamp: new Date("2026-08-30T05:40:15.000Z"),
      },
      completedCompaction("2026-08-30T05:40:16.000Z"),
    ]);

    expect(state.filter((item) => item.kind === "compaction")).toHaveLength(2);
  });
});
