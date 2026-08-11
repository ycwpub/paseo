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
      isTurnActive: false,
      isTurnExpanded: (turnId) => turnId === "u1",
      tail,
      head: [],
    });

    expect(result.tail).toBe(tail);
    expect(result.disclosureByHostId.get("r1")).toEqual({
      processItemCount: 3,
      turnId: "u1",
      isActive: false,
      expanded: true,
      assistantId: "a2",
    });
  });

  it("keeps only the final assistant response block for each turn when collapsed", () => {
    const result = projectProcessVisibility({
      isTurnActive: false,
      isTurnExpanded: () => false,
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

  it("keeps every contiguous part of the final answer when collapsed", () => {
    const result = projectProcessVisibility({
      isTurnActive: false,
      isTurnExpanded: () => false,
      tail: [
        user("u1"),
        assistant("progress"),
        tool("t1"),
        assistant("final-1"),
        assistant("final-2"),
      ],
      head: [],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1", "final-1", "final-2"]);
    expect(result.disclosureByHostId.get("final-1")).toEqual({
      processItemCount: 2,
      turnId: "u1",
      isActive: false,
      expanded: false,
      assistantId: "final-2",
    });
  });

  it("expands only the selected completed answer", () => {
    const result = projectProcessVisibility({
      isTurnActive: false,
      isTurnExpanded: (turnId) => turnId === "u1",
      tail: [user("u1"), thought("r1"), assistant("a1"), user("u2"), tool("t2"), assistant("a2")],
      head: [],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1", "r1", "a1", "u2", "a2"]);
    expect(result.disclosureByHostId.get("r1")?.expanded).toBe(true);
    expect(result.disclosureByHostId.get("a2")?.expanded).toBe(false);
  });

  it("expands an active answer by default without expanding completed answers", () => {
    const result = projectProcessVisibility({
      isTurnActive: true,
      isTurnExpanded: (_turnId, isActive) => isActive,
      tail: [user("u1"), thought("r1"), assistant("a1"), user("u2")],
      head: [thought("r2"), tool("t2")],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1", "a1", "u2"]);
    expect(result.head.map((item) => item.id)).toEqual(["r2", "t2"]);
    expect(result.disclosureByHostId.get("a1")?.expanded).toBe(false);
    expect(result.disclosureByHostId.get("r2")?.expanded).toBe(true);
  });

  it("uses a live auxiliary disclosure while a collapsed turn has no result yet", () => {
    const result = projectProcessVisibility({
      isTurnActive: true,
      isTurnExpanded: () => false,
      tail: [user("u1")],
      head: [thought("r1"), tool("t1")],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1"]);
    expect(result.head).toEqual([]);
    expect(result.auxiliaryDisclosure).toEqual({
      processItemCount: 2,
      turnId: "u1",
      isActive: true,
      expanded: false,
    });
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
      isTurnActive: false,
      isTurnExpanded: () => false,
      tail: [user("u1"), tool("t1"), error],
      head: [],
    });

    expect(result.tail.map((item) => item.id)).toEqual(["u1", "error"]);
    expect(result.disclosureByHostId.has("error")).toBe(true);
  });

  it("does not expose an intermediate assistant message as a final result while running", () => {
    const result = projectProcessVisibility({
      isTurnActive: true,
      isTurnExpanded: () => false,
      tail: [user("u1")],
      head: [assistant("a1"), tool("t1")],
    });

    expect(result.head).toEqual([]);
    expect(result.auxiliaryDisclosure?.turnId).toBe("u1");
  });
});
