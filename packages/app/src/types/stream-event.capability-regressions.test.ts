import { describe, expect, it } from "vitest";
import type { AgentStreamEventPayload } from "@getpaseo/protocol/messages";
import { applyStreamEvent } from "@/types/stream";
const baseTimestamp = new Date(0);
const reasoningChunk = (text: string, source?: "thinking" | "text"): AgentStreamEventPayload => ({
    type: "timeline",
    provider: "claude",
    item: {
        type: "reasoning",
        text,
        ...(source ? { source } : {}),
    },
});
describe("applyStreamEvent", () => {
    it("preserves reasoning source and does not merge text commentary with native thinking", () => {
        let result = applyStreamEvent({
            tail: [],
            head: [],
            event: reasoningChunk("先检查实现。", "text"),
            timestamp: baseTimestamp,
        });
        result = applyStreamEvent({
            tail: result.tail,
            head: result.head,
            event: reasoningChunk("I should inspect the repository.", "thinking"),
            timestamp: baseTimestamp,
        });
        expect(result.head).toHaveLength(2);
        expect(result.head[0]).toMatchObject({
            kind: "thought",
            source: "text",
            text: "先检查实现。",
        });
        expect(result.head[1]).toMatchObject({
            kind: "thought",
            source: "thinking",
            text: "I should inspect the repository.",
        });
    });
});
