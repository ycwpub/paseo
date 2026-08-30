import { describe, expect, it } from "vitest";
import {
  buildLoadedChatOutlinePrompts,
  mergeChatOutlinePrompts,
} from "./loaded-prompt-model";
describe("buildLoadedChatOutlinePrompts", () => {
    it("builds a sorted, deduplicated fallback index from loaded user messages", () => {
        const timestamp = new Date("2026-08-28T00:00:00.000Z");
        expect(buildLoadedChatOutlinePrompts([
            {
                kind: "user_message",
                id: "second",
                text: "  second\nmessage  ",
                timestamp,
                timelineCursor: { epoch: "epoch-1", seq: 9 },
            },
            {
                kind: "assistant_message",
                id: "assistant",
                text: "answer",
                timestamp,
                timelineCursor: { epoch: "epoch-1", seq: 5 },
            },
            {
                kind: "user_message",
                id: "first",
                text: "first message",
                timestamp,
                timelineCursor: { epoch: "epoch-1", seq: 2 },
            },
            {
                kind: "user_message",
                id: "other-epoch",
                text: "ignore",
                timestamp,
                timelineCursor: { epoch: "epoch-2", seq: 1 },
            },
        ], "epoch-1")).toEqual([
            {
                seq: 2,
                timestamp: timestamp.toISOString(),
                preview: "first message",
                answerPreview: "answer",
            },
            { seq: 9, timestamp: timestamp.toISOString(), preview: "second message" },
        ]);
    });
    it("keeps loaded prompts visible and prefers their live answer while merging an index", () => {
        expect(mergeChatOutlinePrompts([
            { seq: 2, timestamp: "indexed-2", preview: "indexed second" },
            {
                seq: 7,
                timestamp: "indexed-7",
                preview: "indexed seventh",
                answerPreview: "stale answer",
            },
        ], [
            {
                seq: 7,
                timestamp: "loaded-7",
                preview: "loaded seventh",
                answerPreview: "live answer",
            },
            { seq: 9, timestamp: "loaded-9", preview: "live ninth" },
        ])).toEqual([
            { seq: 2, timestamp: "indexed-2", preview: "indexed second" },
            {
                seq: 7,
                timestamp: "indexed-7",
                preview: "indexed seventh",
                answerPreview: "live answer",
            },
            { seq: 9, timestamp: "loaded-9", preview: "live ninth" },
        ]);
    });
});
