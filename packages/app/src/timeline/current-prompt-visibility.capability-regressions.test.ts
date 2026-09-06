import { describe, expect, it } from "vitest";
import { projectProcessVisibility } from "@/agent-stream/process-visibility";
import { createUserMessage, type StreamItem } from "@/types/stream";
import {
  processTimelineResponse,
  type ProcessTimelineResponseInput,
} from "./session-stream-reducers";

describe("current prompt visibility during timeline bootstrap", () => {
  it("preserves a live prompt and reasoning that arrived after a stale reset snapshot", () => {
    const currentPrompt = createUserMessage({
      id: "current-prompt",
      clientMessageId: "current-prompt-client",
      messageId: "current-prompt-provider",
      turnId: "current-turn",
      timelineCursor: { epoch: "epoch-1", seq: 101 },
      text: "当前发送的问题",
      timestamp: new Date("2026-09-06T12:05:08.248Z"),
    });
    const currentReasoning: StreamItem = {
      kind: "thought",
      id: "current-reasoning",
      turnId: "current-turn",
      timelineCursor: { epoch: "epoch-1", seq: 102 },
      text: "正在分析",
      status: "loading",
      timestamp: new Date("2026-09-06T12:05:09.000Z"),
    };
    const input: ProcessTimelineResponseInput = {
      payload: {
        agentId: "agent-1",
        direction: "tail",
        projection: "projected",
        reset: true,
        epoch: "epoch-1",
        window: { minSeq: 1, maxSeq: 100, nextSeq: 101 },
        startCursor: { seq: 1 },
        endCursor: { seq: 100 },
        entries: [
          {
            seqStart: 100,
            seqEnd: 100,
            provider: "traecli",
            item: {
              type: "assistant_message",
              text: "上一轮回答",
              messageId: "previous-answer",
            },
            timestamp: new Date("2026-09-06T12:00:00.000Z").toISOString(),
          },
        ],
        error: null,
        hasNewer: false,
        hasOlder: true,
      },
      currentTail: [],
      currentHead: [currentPrompt, currentReasoning],
      currentCursor: undefined,
      isInitializing: true,
      hasActiveInitDeferred: true,
      initRequestDirection: "tail",
      sendingClientMessageIds: [],
    };

    const synchronized = processTimelineResponse(input);

    expect(synchronized.head.map((item) => item.id)).toEqual([
      "current-prompt",
      "current-reasoning",
    ]);

    const visible = projectProcessVisibility({
      isTurnActive: true,
      isTurnExpanded: () => false,
      tail: synchronized.tail,
      head: synchronized.head,
    });

    expect(
      [...visible.tail, ...visible.head]
        .filter((item) => item.kind === "user_message")
        .map((item) => item.text),
    ).toEqual(["当前发送的问题"]);
    expect(visible.auxiliaryDisclosure?.turnId).toBe("current-prompt");
  });
});
