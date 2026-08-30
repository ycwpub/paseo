import { describe, expect, it } from "vitest";
import { selectTimelineCacheWindow } from "./timeline-cache-policy";

describe("selectTimelineCacheWindow", () => {
  it("keeps a complete tool-heavy latest turn", () => {
    const items = [
      { kind: "user_message", id: "old-prompt" },
      ...Array.from({ length: 80 }, (_, index) => ({
        kind: "tool_call",
        id: `old-tool-${index}`,
      })),
      { kind: "assistant_message", id: "old-answer" },
      { kind: "user_message", id: "latest-prompt" },
      ...Array.from({ length: 97 }, (_, index) => ({
        kind: "tool_call",
        id: `latest-tool-${index}`,
      })),
      { kind: "assistant_message", id: "latest-answer" },
    ];

    const selected = selectTimelineCacheWindow(items, 50);

    expect(selected.startsAtTurnBoundary).toBe(true);
    expect(selected.items[0]?.id).toBe("latest-prompt");
    expect(selected.items.filter((item) => item.kind === "tool_call")).toHaveLength(97);
    expect(selected.items.at(-1)?.id).toBe("latest-answer");
  });

  it("falls back to a bounded suffix when no turn boundary is available", () => {
    const items = Array.from({ length: 80 }, (_, index) => ({
      kind: "tool_call",
      id: `tool-${index}`,
    }));

    const selected = selectTimelineCacheWindow(items, 50);

    expect(selected.startsAtTurnBoundary).toBe(false);
    expect(selected.startIndex).toBe(30);
    expect(selected.items).toHaveLength(50);
  });
});
