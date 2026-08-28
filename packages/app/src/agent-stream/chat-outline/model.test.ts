import { describe, expect, it } from "vitest";
import {
  buildLoadedChatOutlinePrompts,
  createActivePromptPublisher,
  mergeChatOutlinePrompts,
  shouldAcceptPromptIndexEpoch,
  promptTickMagnification,
  resolveActivePromptSeq,
  OUTLINE_MAGNIFY_RADIUS,
  type ChatOutlinePrompt,
} from "./model";

describe("chat outline prompt index epoch", () => {
  it("accepts only the authoritative timeline epoch", () => {
    expect(shouldAcceptPromptIndexEpoch("epoch-2", "epoch-2")).toBe(true);
    expect(shouldAcceptPromptIndexEpoch("epoch-2", "epoch-1")).toBe(false);
    expect(shouldAcceptPromptIndexEpoch(null, "epoch-1")).toBe(true);
  });
});

describe("buildLoadedChatOutlinePrompts", () => {
  it("builds a sorted, deduplicated fallback index from loaded user messages", () => {
    const timestamp = new Date("2026-08-28T00:00:00.000Z");
    expect(
      buildLoadedChatOutlinePrompts(
        [
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
        ],
        "epoch-1",
      ),
    ).toEqual([
      { seq: 2, timestamp: timestamp.toISOString(), preview: "first message" },
      { seq: 9, timestamp: timestamp.toISOString(), preview: "second message" },
    ]);
  });

  it("keeps loaded prompts visible while merging a complete server index", () => {
    expect(
      mergeChatOutlinePrompts(
        [
          { seq: 2, timestamp: "indexed-2", preview: "indexed second" },
          { seq: 7, timestamp: "indexed-7", preview: "indexed seventh" },
        ],
        [
          { seq: 7, timestamp: "loaded-7", preview: "loaded seventh" },
          { seq: 9, timestamp: "loaded-9", preview: "live ninth" },
        ],
      ),
    ).toEqual([
      { seq: 2, timestamp: "indexed-2", preview: "indexed second" },
      { seq: 7, timestamp: "indexed-7", preview: "indexed seventh" },
      { seq: 9, timestamp: "loaded-9", preview: "live ninth" },
    ]);
  });
});

function prompt(seq: number): ChatOutlinePrompt {
  return { seq, timestamp: new Date(seq).toISOString(), preview: `prompt ${seq}` };
}

describe("promptTickMagnification", () => {
  it("peaks under the pointer and decays to nothing at the radius", () => {
    expect(promptTickMagnification(0)).toBe(1);
    expect(promptTickMagnification(OUTLINE_MAGNIFY_RADIUS)).toBe(0);
    expect(promptTickMagnification(OUTLINE_MAGNIFY_RADIUS + 10)).toBe(0);
  });

  it("falls off monotonically and symmetrically around the pointer", () => {
    const above = [0, 1, 2, 3].map((distance) => promptTickMagnification(distance));
    const below = [0, -1, -2, -3].map((distance) => promptTickMagnification(distance));

    expect(above).toEqual(below);
    expect(above).toEqual([...above].sort((left, right) => right - left));
  });
});

describe("resolveActivePromptSeq", () => {
  const prompts = [prompt(2), prompt(9), prompt(20)];

  it("marks the prompt whose turn the reading position sits in", () => {
    expect(resolveActivePromptSeq(prompts, 9)).toBe(9);
    expect(resolveActivePromptSeq(prompts, 14)).toBe(9);
    expect(resolveActivePromptSeq(prompts, 20)).toBe(20);
    expect(resolveActivePromptSeq(prompts, 99)).toBe(20);
  });

  it("marks nothing above the first prompt or without a reading position", () => {
    expect(resolveActivePromptSeq(prompts, 1)).toBeNull();
    expect(resolveActivePromptSeq(prompts, null)).toBeNull();
    expect(resolveActivePromptSeq([], 42)).toBeNull();
  });
});

describe("createActivePromptPublisher", () => {
  it("notifies subscribers only when the active prompt changes", () => {
    const publisher = createActivePromptPublisher();
    let notifications = 0;
    const unsubscribe = publisher.subscribe(() => {
      notifications += 1;
    });

    publisher.publish(9);
    publisher.publish(9);
    publisher.publish(20);
    unsubscribe();
    publisher.publish(null);

    expect(notifications).toBe(2);
    expect(publisher.getActiveSeq()).toBeNull();
  });
});
