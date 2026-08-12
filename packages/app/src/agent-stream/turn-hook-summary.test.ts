import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { collectTurnHookCalls } from "./turn-hook-summary-model";

const at = new Date("2026-08-12T08:00:00.000Z");

function tool(id: string, name: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name,
        status: "completed",
        error: null,
        detail: { type: "unknown", input: null, output: null },
      },
    },
  };
}

describe("collectTurnHookCalls", () => {
  it("groups calls by hook name and preserves first-seen order", () => {
    expect(
      collectTurnHookCalls([tool("1", "shell"), tool("2", "read_file"), tool("3", "shell")]),
    ).toEqual([
      { name: "shell", count: 2 },
      { name: "read_file", count: 1 },
    ]);
  });
});
