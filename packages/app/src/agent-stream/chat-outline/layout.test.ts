import { describe, expect, it } from "vitest";
import {
  CHAT_OUTLINE_CONTENT_GAP,
  CHAT_OUTLINE_CONTENT_INSET,
  CHAT_OUTLINE_RAIL_LEFT,
  CHAT_OUTLINE_RAIL_WIDTH,
  shouldReserveChatOutlineContentInset,
} from "./layout";

describe("chat outline layout", () => {
  it("keeps a fixed gap between the clickable rail and transcript content", () => {
    expect(CHAT_OUTLINE_CONTENT_INSET - (CHAT_OUTLINE_RAIL_LEFT + CHAT_OUTLINE_RAIL_WIDTH)).toBe(
      CHAT_OUTLINE_CONTENT_GAP,
    );
    expect(CHAT_OUTLINE_CONTENT_GAP).toBeGreaterThan(0);
  });

  it("reserves the gutter only while the web rail is visible", () => {
    expect(
      shouldReserveChatOutlineContentInset({
        enabled: true,
        hasPrompts: true,
        isPanelNarrow: false,
        isWeb: true,
      }),
    ).toBe(true);
    expect(
      shouldReserveChatOutlineContentInset({
        enabled: true,
        hasPrompts: true,
        isPanelNarrow: true,
        isWeb: true,
      }),
    ).toBe(false);
    expect(
      shouldReserveChatOutlineContentInset({
        enabled: true,
        hasPrompts: true,
        isPanelNarrow: false,
        isWeb: false,
      }),
    ).toBe(false);
  });
});
