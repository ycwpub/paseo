import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { projectProcessVisibility } from "./process-visibility";

const at = new Date("2026-08-09T08:00:00.000Z");

function user(id: string): StreamItem {
  return { kind: "user_message", id, text: id, timestamp: at };
}

function assistant(id: string): StreamItem {
  return { kind: "assistant_message", id, text: id, timestamp: at };
}

function thought(id: string): StreamItem {
  return { kind: "thought", id, text: id, timestamp: at, status: "ready" };
}

function tool(id: string): StreamItem {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name: "shell",
        status: "completed",
        error: null,
        detail: { type: "unknown", input: null, output: null },
      },
    },
  };
}

describe("projectProcessVisibility", () => {
  it("keeps the complete process and hosts the disclosure on its first item when expanded", () => {
    const tail = [user("u1"), thought("r1"), assistant("a1"), tool("t1"), assistant("a2")];
    const result = projectProcessVisibility({
      expanded: true,
      isTurnActive: false,
      tail,
      head: [],
    });

    expect(result.tail).toBe(tail);
    expect(result.disclosureByHostId.get("r1")).toEqual({ processItemCount: 3 });
  });

  it("keeps only the final assistant result for each turn when collapsed", () => {
    const result = projectProcessVisibility({
      expanded: false,
      isTurnActive: false,
      tail: [
        user("u1"),
        thought("r1"),
        assistant("a1"),
        tool("t1"),
        assistant("a2"),
        user("u2"),
        tool("t2"),
        assistant("a3"),
      ],
      head: [],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1", "a2", "u2", "a3"]);
    expect([...result.disclosureByHostId.keys()]).toEqual(["a2", "a3"]);
  });

  it("uses a live auxiliary disclosure while a collapsed turn has no result yet", () => {
    const result = projectProcessVisibility({
      expanded: false,
      isTurnActive: true,
      tail: [user("u1")],
      head: [thought("r1"), tool("t1")],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1"]);
    expect(result.head).toEqual([]);
    expect(result.needsAuxiliaryDisclosure).toBe(true);
  });

  it("preserves an error as the result when no assistant response exists", () => {
    const error: StreamItem = {
      kind: "activity_log",
      id: "error",
      timestamp: at,
      activityType: "error",
      message: "failed",
    };
    const result = projectProcessVisibility({
      expanded: false,
      isTurnActive: false,
      tail: [user("u1"), tool("t1"), error],
      head: [],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1", "error"]);
    expect(result.disclosureByHostId.has("error")).toBe(true);
  });

  it("does not expose an intermediate assistant message as a final result while running", () => {
    const result = projectProcessVisibility({
      expanded: false,
      isTurnActive: true,
      tail: [user("u1")],
      head: [assistant("a1"), tool("t1")],
    });

    expect(result.head).toEqual([]);
    expect(result.needsAuxiliaryDisclosure).toBe(true);
  });
});
