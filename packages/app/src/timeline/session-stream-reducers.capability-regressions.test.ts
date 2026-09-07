import { describe, expect, it } from "vitest";
import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { type StreamItem } from "@/types/stream";
import {
  createAgentStreamReducerQueue,
  type AgentStreamReducerEvent,
} from "./session-stream-reducers";
function makeStreamReducerEvent(
  event: AgentStreamEventPayload,
  seq: number,
): AgentStreamReducerEvent {
  return {
    event,
    seq,
    epoch: "epoch-1",
    timestamp: new Date(1000 + seq),
  };
}
describe("createAgentStreamReducerQueue", () => {
  function createManualScheduler() {
    let nextId = 1;
    const callbacks = new Map<number, () => void>();
    return {
      schedule(callback: () => void) {
        const id = nextId;
        nextId += 1;
        callbacks.set(id, callback);
        return id;
      },
      cancel(id: number) {
        callbacks.delete(id);
      },
      flushOne() {
        const entry = callbacks.entries().next().value;
        if (!entry) {
          throw new Error("Expected a scheduled callback");
        }
        const [id, callback] = entry;
        callbacks.delete(id);
        callback();
      },
      get size() {
        return callbacks.size;
      },
    };
  }
  it("reports committed compaction completion after updating the timeline", () => {
    const scheduler = createManualScheduler();
    let currentTail: StreamItem[] = [];
    let currentHead: StreamItem[] = [];
    const committedStatuses: string[] = [];
    const queue = createAgentStreamReducerQueue({
      getSnapshot: () => ({
        currentTail,
        currentHead,
        currentCursor: undefined,
      }),
      commit: (_agentId, result, events) => {
        currentTail = result.tail;
        currentHead = result.head;
        const latestCompaction = currentTail.find((item) => item.kind === "compaction");
        const completedEvent = events.some(
          ({ event }) =>
            event.type === "timeline" &&
            event.item.type === "compaction" &&
            event.item.status === "completed",
        );
        if (completedEvent && latestCompaction?.kind === "compaction") {
          committedStatuses.push(latestCompaction.status);
        }
      },
      handleSideEffects: () => {},
      scheduleFlush: scheduler.schedule,
      cancelFlush: scheduler.cancel,
    });
    queue.enqueue(
      "agent-1",
      makeStreamReducerEvent(
        {
          type: "timeline",
          provider: "codex",
          item: { type: "compaction", status: "loading", trigger: "auto" },
        },
        1,
      ),
    );
    queue.flushAgent("agent-1");
    queue.enqueue(
      "agent-1",
      makeStreamReducerEvent(
        {
          type: "timeline",
          provider: "codex",
          item: { type: "compaction", status: "completed", trigger: "auto" },
        },
        2,
      ),
    );
    queue.flushAgent("agent-1");
    expect(committedStatuses).toEqual(["completed"]);
  });
});
