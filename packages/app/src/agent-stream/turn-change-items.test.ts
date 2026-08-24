import { describe, expect, it } from "vitest";
import type { StreamItem } from "@/types/stream";
import { projectProcessVisibility } from "./process-visibility";
import { indexTurnChangeItemsByAssistantId } from "./turn-change-items";

const at = new Date("2026-08-27T10:00:00.000Z");

function user(id: string): Extract<StreamItem, { kind: "user_message" }> {
  return { kind: "user_message", id, text: id, timestamp: at };
}

function assistant(id: string): Extract<StreamItem, { kind: "assistant_message" }> {
  return { kind: "assistant_message", id, text: id, timestamp: at };
}

function shell(id: string, cwd: string): Extract<StreamItem, { kind: "tool_call" }> {
  return {
    kind: "tool_call",
    id,
    timestamp: at,
    payload: {
      source: "agent",
      data: {
        provider: "codex",
        callId: id,
        name: "exec_command",
        status: "completed",
        error: null,
        detail: { type: "shell", command: "git status", cwd },
      },
    },
  };
}

describe("indexTurnChangeItemsByAssistantId", () => {
  it("keeps hidden tool calls available after a completed turn is collapsed", () => {
    const tool = shell("tool-1", "repos/repo-a");
    const answer = assistant("assistant-1");
    const tail: StreamItem[] = [user("user-1"), tool, answer];
    const visible = projectProcessVisibility({
      isTurnActive: false,
      isTurnExpanded: () => false,
      tail,
      head: [],
    });

    expect(visible.tail).toEqual([user("user-1"), answer]);
    expect(indexTurnChangeItemsByAssistantId({ tail, head: [] }).get(answer.id)).toEqual([
      tool,
      answer,
    ]);
  });

  it("collects all repository calls in one turn without mixing the next turn", () => {
    const firstTool = shell("tool-1", "repos/repo-a");
    const secondTool = shell("tool-2", "repos/repo-b");
    const firstAnswer = assistant("assistant-1");
    const nextTool = shell("tool-3", "repos/repo-c");
    const nextAnswer = assistant("assistant-2");

    const index = indexTurnChangeItemsByAssistantId({
      tail: [
        user("user-1"),
        firstTool,
        secondTool,
        firstAnswer,
        user("user-2"),
        nextTool,
        nextAnswer,
      ],
      head: [],
    });

    expect(index.get(firstAnswer.id)).toEqual([firstTool, secondTool, firstAnswer]);
    expect(index.get(nextAnswer.id)).toEqual([nextTool, nextAnswer]);
  });

  it("joins a turn that spans retained history and the live head", () => {
    const tool = shell("tool-1", "repos/repo-a");
    const answer = assistant("assistant-1");

    const index = indexTurnChangeItemsByAssistantId({
      tail: [user("user-1"), tool],
      head: [answer],
    });

    expect(index.get(answer.id)).toEqual([tool, answer]);
  });
});
